const MAX_BODY_BYTES = 16 * 1024;

export interface IngestEnvironment {
  ISG_DEVICE_ID?: string;
  ISG_INGEST_TOKEN?: string;
}

export type StoreMeasurement = (measurement: Record<string, unknown>) => Promise<void>;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function tokensMatch(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < actualBytes.length; index++) {
    difference |= actualBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

function hasTimezone(timestamp: string): boolean {
  return /(Z|[+-]\d{2}:\d{2})$/i.test(timestamp) && !Number.isNaN(Date.parse(timestamp));
}

export function createIngestHandler(
  environment: IngestEnvironment,
  storeMeasurement: StoreMeasurement,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }

    const expectedToken = environment.ISG_INGEST_TOKEN;
    const expectedDeviceId = environment.ISG_DEVICE_ID;
    if (!expectedToken || !expectedDeviceId) {
      console.error("ISG_INGEST_TOKEN and ISG_DEVICE_ID must be configured");
      return json(500, { error: "server_misconfigured" });
    }

    const suppliedToken = request.headers.get("x-isg-token") ?? "";
    if (!suppliedToken || !(await tokensMatch(suppliedToken, expectedToken))) {
      return json(401, { error: "unauthorized" });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      return json(415, { error: "content_type_must_be_application_json" });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json(413, { error: "payload_too_large" });
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return json(413, { error: "payload_too_large" });
    }

    let measurement: unknown;
    try {
      measurement = JSON.parse(body);
    } catch {
      return json(400, { error: "invalid_json" });
    }

    if (!measurement || typeof measurement !== "object" || Array.isArray(measurement)) {
      return json(400, { error: "payload_must_be_an_object" });
    }
    const row = measurement as Record<string, unknown>;
    if (row.device_id !== expectedDeviceId) {
      return json(403, { error: "device_id_mismatch" });
    }
    if (typeof row.timestamp !== "string" || !hasTimezone(row.timestamp)) {
      return json(400, { error: "invalid_timestamp" });
    }

    try {
      await storeMeasurement(row);
    } catch (error) {
      console.error("Failed to store telemetry", error);
      return json(502, { error: "database_error" });
    }

    return json(202, { accepted: true });
  };
}

export { MAX_BODY_BYTES };
