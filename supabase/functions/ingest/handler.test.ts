import { describe, expect, test } from "bun:test";
import {
  createIngestHandler,
  createRestMeasurementStore,
  type MeasurementStore,
} from "./handler.ts";

const TOKEN = "a-dedicated-device-token";
const payload = { device_id: "heatpump-main", timestamp: "2026-10-02T12:00:00Z" };

function request(body: BodyInit = JSON.stringify(payload), headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  if (!requestHeaders.has("X-ISG-Token")) requestHeaders.set("X-ISG-Token", TOKEN);
  return new Request("https://example.test/ingest", {
    method: "POST",
    headers: requestHeaders,
    body,
  });
}

describe("ingest handler", () => {
  test("stores a valid request", async () => {
    let stored: unknown;
    const store: MeasurementStore = { save: async (value) => { stored = value; } };
    const response = await createIngestHandler({ token: TOKEN, store })(request());

    expect(response.status).toBe(204);
    expect(stored).toEqual(payload);
  });

  test.each([undefined, "wrong-token"])("rejects a missing or wrong token", async (token) => {
    const store: MeasurementStore = { save: async () => { throw new Error("must not store"); } };
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token !== undefined) headers.set("X-ISG-Token", token);

    const response = await createIngestHandler({ token: TOKEN, store })(new Request("https://example.test/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }));
    expect(response.status).toBe(401);
  });

  test("rejects a non-JSON content type before parsing", async () => {
    const store: MeasurementStore = { save: async () => { throw new Error("must not store"); } };
    const response = await createIngestHandler({ token: TOKEN, store })(
      request("not JSON", { "Content-Type": "text/plain" }),
    );
    expect(response.status).toBe(415);
  });

  test("rejects a body over 16 KiB", async () => {
    const store: MeasurementStore = { save: async () => { throw new Error("must not store"); } };
    const response = await createIngestHandler({ token: TOKEN, store })(request(`"${"x".repeat(16 * 1024)}"`));
    expect(response.status).toBe(413);
  });

  test("returns a detail-free 502 when storage fails", async () => {
    const store: MeasurementStore = { save: async () => { throw new Error("database password and internals"); } };
    const response = await createIngestHandler({ token: TOKEN, store })(request());

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("database password and internals");
  });
});

test("REST storage sends an sb_secret only as apikey", async () => {
  const secret = "sb_secret_example";
  let init: RequestInit | undefined;
  const fakeFetch: typeof fetch = async (_input, requestInit) => {
    init = requestInit;
    return new Response(null, { status: 201 });
  };

  await createRestMeasurementStore("https://project.supabase.co", secret, fakeFetch).save(payload);
  const headers = new Headers(init?.headers);
  expect(headers.get("apikey")).toBe(secret);
  expect(headers.has("authorization")).toBe(false);
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.get("prefer")).toBe("resolution=merge-duplicates,return=minimal");
});
