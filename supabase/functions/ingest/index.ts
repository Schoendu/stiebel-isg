const MAX_BODY_BYTES = 16 * 1024;

type Rule = {
  type: "number" | "integer" | "boolean";
  min?: number;
  max?: number;
};

// This is deliberately an allow-list: adding a database column does not
// automatically make it writable by an untrusted device request.
export const TELEMETRY_FIELDS: Readonly<Record<string, Rule>> = {
  outside_temperature_c: { type: "number", min: -100, max: 100 },
  heatpump1_flow_c: { type: "number", min: -100, max: 200 },
  heatpump1_return_c: { type: "number", min: -100, max: 200 },
  heatpump1_hotgas_c: { type: "number", min: -100, max: 250 },
  heatpump1_low_pressure_bar: { type: "number", min: 0, max: 100 },
  heatpump1_high_pressure_bar: { type: "number", min: 0, max: 100 },
  heatpump1_flowrate_lmin: { type: "number", min: 0, max: 500 },
  thermal_power_kw: { type: "number", min: -100, max: 500 },
  dhw_actual_c: { type: "number", min: -20, max: 100 },
  dhw_target_c: { type: "number", min: -20, max: 100 },
  compressor1: { type: "boolean" },
  dhw_charging_pump: { type: "boolean" },
  buffer_charging_pump1: { type: "boolean" },
  heating_circuit1_pump: { type: "boolean" },
  defrost_initiated: { type: "boolean" },
  heat_dhw_today_kwh: { type: "number", min: 0, max: 10000 },
  electricity_dhw_today_kwh: { type: "number", min: 0, max: 10000 },
  heat_heating_today_kwh: { type: "number", min: 0, max: 10000 },
  electricity_heating_today_kwh: { type: "number", min: 0, max: 10000 },
  can_bus_status: { type: "integer", min: 0, max: 65535 },
  live_poll_errors: { type: "integer", min: 0, max: 2147483647 },
  energy_poll_errors: { type: "integer", min: 0, max: 2147483647 },
  config_poll_errors: { type: "integer", min: 0, max: 2147483647 },
  device_uptime_s: { type: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
  modbus_ok: { type: "boolean" },
  sd_ok: { type: "boolean" },
};

export type Measurement = Record<string, string | number | boolean>;
export type StoreMeasurement = (measurement: Measurement) => Promise<void>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTimezoneQualifiedTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return false;

  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (
    y < 1 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > daysInMonth ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return false;
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  return !Number.isNaN(Date.parse(value));
}

export function validatePayload(
  payload: unknown,
  deviceId: string,
): Measurement {
  if (!isObject(payload)) throw new Error("payload must be a JSON object");
  const permitted = new Set([
    "device_id",
    "timestamp",
    ...Object.keys(TELEMETRY_FIELDS),
  ]);
  for (const [key, value] of Object.entries(payload)) {
    if (!permitted.has(key)) throw new Error(`unknown field: ${key}`);
    if (value === null) throw new Error(`field ${key} must not be null`);
  }
  if ("device_id" in payload && payload.device_id !== deviceId) {
    throw new Error("device_id does not match the authenticated device");
  }
  if (!isTimezoneQualifiedTimestamp(payload.timestamp)) {
    throw new Error("timestamp must be a real ISO 8601 date with a timezone");
  }

  const telemetryEntries = Object.entries(payload).filter(
    ([key]) => key in TELEMETRY_FIELDS,
  );
  if (telemetryEntries.length === 0)
    throw new Error("at least one telemetry field is required");
  for (const [key, value] of telemetryEntries) {
    const rule = TELEMETRY_FIELDS[key];
    if (rule.type === "boolean") {
      if (typeof value !== "boolean")
        throw new Error(`field ${key} must be boolean`);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`field ${key} must be a finite number`);
    }
    if (rule.type === "integer" && !Number.isSafeInteger(value)) {
      throw new Error(`field ${key} must be an integer`);
    }
    if (
      (rule.min !== undefined && value < rule.min) ||
      (rule.max !== undefined && value > rule.max)
    ) {
      throw new Error(`field ${key} is outside the allowed range`);
    }
  }
  return { ...payload, device_id: deviceId } as Measurement;
}

export function selectSecretKey(
  rawSecretKeys: string,
  keyName = "default",
): string {
  let keys: unknown;
  try {
    keys = JSON.parse(rawSecretKeys);
  } catch {
    throw new Error("SUPABASE_SECRET_KEYS must be a JSON object");
  }
  if (
    !isObject(keys) ||
    typeof keys[keyName] !== "string" ||
    keys[keyName].length === 0
  ) {
    throw new Error(
      `SUPABASE_SECRET_KEYS does not contain a non-empty '${keyName}' key`,
    );
  }
  return keys[keyName] as string;
}

export function createRestMeasurementStore(
  supabaseUrl: string,
  secretKey: string,
  fetcher: typeof fetch = fetch,
): StoreMeasurement {
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/measurements?on_conflict=device_id,timestamp`;
  return async (measurement) => {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(measurement),
    });
    if (!response.ok)
      throw new Error(`Supabase storage failed with status ${response.status}`);
  };
}

async function readLimitedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES)
    throw new Error("request body is too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("request body is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createHandler(config: {
  ingestToken: string;
  deviceId: string;
  storeMeasurement: StoreMeasurement;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST")
      return json(405, { error: "method not allowed" });
    if (request.headers.get("X-ISG-Token") !== config.ingestToken)
      return json(401, { error: "unauthorized" });
    let payload: unknown;
    try {
      payload = JSON.parse(await readLimitedBody(request));
      // Validation intentionally precedes the only call to the privileged store.
      const measurement = validatePayload(payload, config.deviceId);
      await config.storeMeasurement(measurement);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "invalid request";
      const status = message.startsWith("Supabase storage failed")
        ? 502
        : message === "request body is too large"
          ? 413
          : 400;
      return json(status, { error: message });
    }
    return json(202, { accepted: true });
  };
}

if (import.meta.main) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = selectSecretKey(
    Deno.env.get("SUPABASE_SECRET_KEYS") ?? "",
    Deno.env.get("SUPABASE_SECRET_KEY_NAME") ?? "default",
  );
  Deno.serve(
    createHandler({
      ingestToken: Deno.env.get("ISG_INGEST_TOKEN") ?? "",
      deviceId: Deno.env.get("ISG_DEVICE_ID") ?? "",
      storeMeasurement: createRestMeasurementStore(supabaseUrl, secretKey),
    }),
  );
}
