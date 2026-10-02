import {
  createHandler,
  createRestMeasurementStore,
  selectSecretKey,
  validatePayload,
} from "./index.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, expected: string) {
  try {
    fn();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expected),
      `expected error containing ${expected}`,
    );
    return;
  }
  throw new Error("expected function to throw");
}

const timestamp = "2026-10-02T20:00:00+00:00";

Deno.test(
  "strict telemetry validation rejects unknown, null, mistyped and invalid values",
  () => {
    assertThrows(
      () => validatePayload({ timestamp, surprise: 1 }, "hp"),
      "unknown field",
    );
    assertThrows(
      () => validatePayload({ timestamp, modbus_ok: null }, "hp"),
      "must not be null",
    );
    assertThrows(
      () => validatePayload({ timestamp, modbus_ok: 1 }, "hp"),
      "must be boolean",
    );
    assertThrows(
      () => validatePayload({ timestamp, live_poll_errors: 1.5 }, "hp"),
      "must be an integer",
    );
    assertThrows(
      () =>
        validatePayload({ timestamp, heatpump1_high_pressure_bar: 101 }, "hp"),
      "allowed range",
    );
    assertThrows(
      () => validatePayload({ timestamp }, "hp"),
      "at least one telemetry field",
    );
  },
);

Deno.test("timestamps require a timezone and a real calendar date", () => {
  assertThrows(
    () =>
      validatePayload(
        { timestamp: "2025-02-29T12:00:00Z", can_bus_status: 0 },
        "hp",
      ),
    "real ISO",
  );
  assertThrows(
    () =>
      validatePayload(
        { timestamp: "2024-02-29T12:00:00", can_bus_status: 0 },
        "hp",
      ),
    "real ISO",
  );
  assert(
    validatePayload(
      { timestamp: "2024-02-29T12:00:00Z", can_bus_status: 0 },
      "hp",
    ).device_id === "hp",
  );
});

Deno.test(
  "device identity is bound and received_at is never client writable",
  () => {
    assertThrows(
      () =>
        validatePayload(
          { timestamp, received_at: timestamp, can_bus_status: 0 },
          "hp",
        ),
      "unknown field",
    );
    assertThrows(
      () =>
        validatePayload(
          { device_id: "other", timestamp, can_bus_status: 0 },
          "hp",
        ),
      "does not match",
    );
  },
);

Deno.test("handler validates before calling storeMeasurement", async () => {
  let calls = 0;
  const handler = createHandler({
    ingestToken: "token",
    deviceId: "hp",
    storeMeasurement: async () => {
      calls++;
    },
  });
  const response = await handler(
    new Request("https://example.test/ingest", {
      method: "POST",
      headers: { "X-ISG-Token": "token" },
      body: JSON.stringify({ timestamp, unknown: true }),
    }),
  );
  assert(response.status === 400);
  assert(calls === 0);
});

Deno.test(
  "secret-key JSON map configures the privileged REST client",
  async () => {
    const secret = selectSecretKey(
      JSON.stringify({
        default: "sb_secret_expected",
        rotation: "sb_secret_next",
      }),
    );
    assert(secret === "sb_secret_expected");
    let request: Request | undefined;
    const store = createRestMeasurementStore(
      "https://project.supabase.co/",
      secret,
      async (input, init) => {
        request = new Request(input, init);
        return new Response(null, { status: 201 });
      },
    );
    await store({ device_id: "hp", timestamp, can_bus_status: 0 });
    assert(request?.headers.get("apikey") === "sb_secret_expected");
    assert(
      request?.headers.get("authorization") === "Bearer sb_secret_expected",
    );
    assertThrows(() => selectSecretKey("sb_secret_wrong"), "JSON object");
  },
);
