import assert from "node:assert/strict";
import { test } from "node:test";
import { createIngestHandler, MAX_BODY_BYTES } from "./handler.ts";

const environment = {
  ISG_DEVICE_ID: "heatpump-main",
  ISG_INGEST_TOKEN: "test-device-token",
};

function request(
  body: Record<string, unknown> = {
    device_id: "heatpump-main",
    timestamp: "2026-10-02T12:34:56Z",
    can_bus_status: 0,
  },
  headers: Record<string, string> = {},
): Request {
  return new Request("https://example.test/functions/v1/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-isg-token": "test-device-token",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("accepts a valid request", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const handler = createIngestHandler(environment, async (row) => {
    stored.push(row);
  });
  const response = await handler(request());
  assert.equal(response.status, 202);
  assert.equal(stored.length, 1);
});

test("rejects a wrong or missing token", async (context) => {
  const handler = createIngestHandler(environment, async () => {});
  for (const [name, token] of [["wrong", "wrong-token"], ["missing", undefined]] as const) {
    await context.test(name, async () => {
      const headers = new Headers({ "content-type": "application/json" });
      if (token) headers.set("x-isg-token", token);
      const response = await handler(new Request("https://example.test", {
        method: "POST",
        headers,
        body: JSON.stringify({ device_id: "heatpump-main" }),
      }));
      assert.equal(response.status, 401);
    });
  }
});

test("rejects a payload for another device", async () => {
  const handler = createIngestHandler(environment, async () => {});
  assert.equal((await handler(request({
    device_id: "other-device",
    timestamp: "2026-10-02T12:34:56Z",
  }))).status, 403);
});

test("rejects an invalid content type", async () => {
  const handler = createIngestHandler(environment, async () => {});
  assert.equal((await handler(request(undefined, { "content-type": "text/plain" }))).status, 415);
});

test("rejects an oversized payload", async () => {
  const handler = createIngestHandler(environment, async () => {});
  assert.equal((await handler(request(undefined, {
    "content-length": String(MAX_BODY_BYTES + 1),
  }))).status, 413);
});

test("reports a database failure without exposing its details", async () => {
  const handler = createIngestHandler(environment, async () => {
    throw new Error("sensitive database detail");
  });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "database_error" });
});
