const MAX_BODY_BYTES = 16 * 1024;

export interface MeasurementStore {
  save(measurement: unknown): Promise<void>;
}

export interface HandlerOptions {
  token: string;
  store: MeasurementStore;
}

function jsonResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Compare tokens without returning as soon as one character differs. */
export function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

async function readLimitedBody(request: Request): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new RangeError("request body is too large");
  }

  if (request.body === null) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new RangeError("request body is too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function createIngestHandler({ token, store }: HandlerOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonResponse(405, "method not allowed");

    const suppliedToken = request.headers.get("x-isg-token") ?? "";
    if (!timingSafeEqual(suppliedToken, token)) {
      return jsonResponse(401, "unauthorized");
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return jsonResponse(415, "content type must be application/json");
    }

    let measurement: unknown;
    try {
      const body = await readLimitedBody(request);
      measurement = JSON.parse(new TextDecoder().decode(body));
    } catch (error) {
      if (error instanceof RangeError) return jsonResponse(413, "request body too large");
      return jsonResponse(400, "invalid JSON");
    }

    try {
      await store.save(measurement);
    } catch {
      // Do not expose PostgREST responses, credentials, or other storage details.
      return jsonResponse(502, "telemetry storage failed");
    }

    return new Response(null, { status: 204 });
  };
}

export function createRestMeasurementStore(
  supabaseUrl: string,
  secretKey: string,
  fetchImplementation: typeof fetch = fetch,
): MeasurementStore {
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/measurements?on_conflict=device_id,timestamp`;

  return {
    async save(measurement: unknown): Promise<void> {
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          apikey: secretKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(measurement),
      });

      if (!response.ok) throw new Error(`measurement store returned ${response.status}`);
    },
  };
}

