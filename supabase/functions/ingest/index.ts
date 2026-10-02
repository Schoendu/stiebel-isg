import {
  PayloadValidationError,
  validateTelemetryPayload,
} from "./validation.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }

  const deviceToken = Deno.env.get("ISG_INGEST_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!deviceToken || !supabaseUrl || !serviceRoleKey) {
    console.error("Required ingestion secrets are not configured");
    return jsonResponse(500, { error: "server_configuration_error" });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  if (!match || !(await tokensMatch(match[1], deviceToken))) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse(415, { error: "content_type_must_be_application_json" });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "payload_too_large" });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "payload_too_large" });
    }
    body = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  let payload;
  try {
    payload = validateTelemetryPayload(body);
  } catch (error) {
    if (error instanceof PayloadValidationError) {
      return jsonResponse(400, { error: "invalid_payload", detail: error.message });
    }
    throw error;
  }

  const endpoint = new URL("/rest/v1/measurements", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "device_id,timestamp");
  let databaseResponse: Response;
  try {
    databaseResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "authorization": `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        "prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Telemetry upsert request failed", error);
    return jsonResponse(502, { error: "storage_error" });
  }

  if (!databaseResponse.ok) {
    console.error("Telemetry upsert failed", databaseResponse.status, await databaseResponse.text());
    return jsonResponse(502, { error: "storage_error" });
  }
  return jsonResponse(200, { status: "accepted" });
}

if (import.meta.main) Deno.serve(handleRequest);
