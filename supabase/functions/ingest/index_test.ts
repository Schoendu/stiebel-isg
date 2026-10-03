import {
  createHandler,
  type MeasurementStore,
  secretKeyFromEnvironment,
  SupabaseRestStore,
} from "./index.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const values: Record<string, string> = {
  ISG_INGEST_TOKEN: "test-token",
  ISG_DEVICE_ID: "heat-pump-1",
};
const env = { get: (name: string) => values[name] };
const validPayload = {
  device_id: "heat-pump-1",
  timestamp: "2026-10-02T12:34:56+02:00",
  outside_temperature_c: 12.5,
  compressor1: true,
  live_poll_errors: 0,
};

class TestStore implements MeasurementStore {
  saved: Record<string, unknown>[] = [];
  fail = false;
  save(value: Record<string, unknown>): Promise<void> {
    if (this.fail) {
      return Promise.reject(new Error("database password and internal detail"));
    }
    this.saved.push(value);
    return Promise.resolve();
  }
}

function request(
  payload: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ISG-Token": "test-token",
      ...headers,
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

Deno.test("accepts a valid payload and saves it", async () => {
  const store = new TestStore();
  const response = await createHandler(store, env)(request(validPayload));
  assertEquals(response.status, 202);
  assertEquals(store.saved.length, 1);
});

Deno.test("rejects a wrong or missing token", async () => {
  const handler = createHandler(new TestStore(), env);
  assertEquals(
    (await handler(request(validPayload, { "X-ISG-Token": "wrong" }))).status,
    401,
  );
  const missing = request(validPayload);
  missing.headers.delete("X-ISG-Token");
  assertEquals((await handler(missing)).status, 401);
});

for (
  const [name, change] of [
    ["wrong device_id", { device_id: "someone-else" }],
    ["unknown field", { unexpected: 1 }],
    ["null field", { outside_temperature_c: null }],
    ["received_at", { received_at: "2026-10-02T12:34:56Z" }],
    ["invalid type", { compressor1: 1 }],
    ["invalid range", { outside_temperature_c: -101 }],
    ["invalid calendar date", { timestamp: "2026-02-30T12:34:56Z" }],
    ["missing timezone", { timestamp: "2026-10-02T12:34:56" }],
  ] as const
) {
  Deno.test(`rejects ${name}`, async () => {
    const response = await createHandler(new TestStore(), env)(
      request({ ...validPayload, ...change }),
    );
    assertEquals(response.status, 400);
  });
}

Deno.test("rejects a payload with no telemetry fields", async () => {
  const { device_id, timestamp } = validPayload;
  assertEquals(
    (await createHandler(new TestStore(), env)(
      request({ device_id, timestamp }),
    )).status,
    400,
  );
});

Deno.test("rejects invalid content type", async () => {
  const response = await createHandler(new TestStore(), env)(
    request(JSON.stringify(validPayload), { "Content-Type": "text/plain" }),
  );
  assertEquals(response.status, 415);
});

Deno.test("rejects a body larger than 16 KiB", async () => {
  const response = await createHandler(new TestStore(), env)(
    request("x".repeat(16 * 1024 + 1)),
  );
  assertEquals(response.status, 413);
});

Deno.test("storage failure is a detail-free 502", async () => {
  const store = new TestStore();
  store.fail = true;
  const response = await createHandler(store, env)(request(validPayload));
  assertEquals(response.status, 502);
  const body = await response.text();
  assert(!body.includes("password"));
  assert(!body.includes("internal detail"));
});

Deno.test("selects default and named SUPABASE_SECRET_KEYS JSON entries", () => {
  const keyEnv = {
    get: (name: string) =>
      name === "SUPABASE_SECRET_KEYS"
        ? '{"default":"sb_secret_default","staging":"sb_secret_staging"}'
        : undefined,
  };
  assertEquals(secretKeyFromEnvironment(keyEnv), "sb_secret_default");
  const namedEnv = {
    get: (name: string) =>
      name === "SUPABASE_SECRET_KEYS"
        ? '{"default":"sb_secret_default","staging":"sb_secret_staging"}'
        : name === "ISG_SECRET_KEY_NAME"
        ? "staging"
        : undefined,
  };
  assertEquals(secretKeyFromEnvironment(namedEnv), "sb_secret_staging");
});

Deno.test("REST store sends the secret only in apikey", async () => {
  const originalFetch = globalThis.fetch;
  let captured: Request | undefined;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    captured = new Request(input, init);
    return Promise.resolve(new Response(null, { status: 201 }));
  }) as typeof fetch;
  try {
    await new SupabaseRestStore(
      "https://example.supabase.co",
      "sb_secret_value",
    ).save(validPayload);
    assertEquals(captured?.headers.get("apikey"), "sb_secret_value");
    assertEquals(captured?.headers.get("authorization"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
