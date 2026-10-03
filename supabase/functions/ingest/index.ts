const MAX_BODY_BYTES = 16 * 1024;

type Environment = { get(name: string): string | undefined };

export interface MeasurementStore {
  save(measurement: Record<string, unknown>): Promise<void>;
}

type NumberRule = { integer?: boolean; min: number; max: number };

// This is deliberately the complete list of client-writable columns in
// public.measurements. received_at is server-owned and is not included.
const NUMBER_FIELDS: Record<string, NumberRule> = {
  // Temperatures, pressures and instantaneous values.
  outside_temperature_c: { min: -100, max: 100 },
  heatpump1_flow_c: { min: -100, max: 200 },
  heatpump1_return_c: { min: -100, max: 200 },
  heatpump1_hotgas_c: { min: -100, max: 250 },
  heatpump1_low_pressure_bar: { min: 0, max: 100 },
  heatpump1_high_pressure_bar: { min: 0, max: 100 },
  heatpump1_flowrate_lmin: { min: 0, max: 500 },
  thermal_power_kw: { min: -100, max: 500 },
  dhw_actual_c: { min: -100, max: 100 },
  dhw_target_c: { min: -100, max: 100 },
  heating_circuit1_actual_c: { min: -100, max: 200 },
  heating_circuit1_target_c: { min: -100, max: 200 },
  return_temperature_actual_c: { min: -100, max: 200 },
  fixed_temperature_target_c: { min: -100, max: 200 },
  buffer_temperature_actual_c: { min: -100, max: 200 },
  buffer_temperature_target_c: { min: -100, max: 200 },
  heating_application_limit_c: { min: -100, max: 200 },
  dhw_application_limit_c: { min: -100, max: 200 },
  hc1_comfort_temperature_c: { min: -100, max: 200 },
  hc1_eco_temperature_c: { min: -100, max: 200 },
  fixed_value_operation_c: { min: -100, max: 200 },
  heating_bivalence_temp_c: { min: -100, max: 200 },
  dhw_eco_temperature_c: { min: -100, max: 200 },
  dhw_bivalence_temp_c: { min: -100, max: 200 },
  hc1_heating_curve_slope: { min: -100, max: 100 },

  // System and HP1 energy counters mirrored from the logger CSV.
  heat_dhw_today_kwh: { min: 0, max: 1000000 },
  electricity_dhw_today_kwh: { min: 0, max: 1000000 },
  heat_heating_today_kwh: { min: 0, max: 1000000 },
  electricity_heating_today_kwh: { min: 0, max: 1000000 },
  heat_heating_total_kwh_part: { min: 0, max: 1000000000 },
  heat_heating_total_mwh: { min: 0, max: 1000000000 },
  heat_dhw_total_kwh_part: { min: 0, max: 1000000000 },
  heat_dhw_total_mwh: { min: 0, max: 1000000000 },
  aux_heat_heating_kwh_part: { min: 0, max: 1000000000 },
  aux_heat_heating_mwh: { min: 0, max: 1000000000 },
  aux_heat_dhw_kwh_part: { min: 0, max: 1000000000 },
  aux_heat_dhw_mwh: { min: 0, max: 1000000000 },
  electricity_heating_kwh_part: { min: 0, max: 1000000000 },
  electricity_heating_mwh: { min: 0, max: 1000000000 },
  electricity_dhw_kwh_part: { min: 0, max: 1000000000 },
  electricity_dhw_mwh: { min: 0, max: 1000000000 },

  hp1_heat_heating_today_kwh: { min: 0, max: 1000000000 },
  hp1_heat_heating_kwh_part: { min: 0, max: 1000000000 },
  hp1_heat_heating_mwh: { min: 0, max: 1000000000 },
  hp1_heat_dhw_today_kwh: { min: 0, max: 1000000000 },
  hp1_heat_dhw_kwh_part: { min: 0, max: 1000000000 },
  hp1_heat_dhw_mwh: { min: 0, max: 1000000000 },
  hp1_aux_heat_heating_kwh_part: { min: 0, max: 1000000000 },
  hp1_aux_heat_heating_mwh: { min: 0, max: 1000000000 },
  hp1_aux_heat_dhw_kwh_part: { min: 0, max: 1000000000 },
  hp1_aux_heat_dhw_mwh: { min: 0, max: 1000000000 },
  hp1_electricity_heating_today_kwh: { min: 0, max: 1000000000 },
  hp1_electricity_heating_kwh_part: { min: 0, max: 1000000000 },
  hp1_electricity_heating_mwh: { min: 0, max: 1000000000 },
  hp1_electricity_dhw_today_kwh: { min: 0, max: 1000000000 },
  hp1_electricity_dhw_kwh_part: { min: 0, max: 1000000000 },
  hp1_electricity_dhw_mwh: { min: 0, max: 1000000000 },
  hp1_aux_stage1_runtime_h: { min: 0, max: 1000000000 },
  hp1_aux_stage2_runtime_h: { min: 0, max: 1000000000 },
  hp1_aux_stage12_runtime_h: { min: 0, max: 1000000000 },

  // Raw enum/status registers.
  sg_ready_enabled: { integer: true, min: 0, max: 65535 },
  sg_ready_input1: { integer: true, min: 0, max: 65535 },
  sg_ready_input2: { integer: true, min: 0, max: 65535 },
  sg_ready_operating_state: { integer: true, min: 0, max: 65535 },
  controller_identification: { integer: true, min: 0, max: 65535 },
  operating_mode: { integer: true, min: 0, max: 65535 },
  dhw_stages: { integer: true, min: 0, max: 65535 },
  operating_status: { integer: true, min: 0, max: 65535 },
  power_off_status: { integer: true, min: 0, max: 65535 },
  fault_status: { integer: true, min: 0, max: 65535 },
  can_bus_status: { integer: true, min: 0, max: 65535 },
  active_error_number: { integer: true, min: 0, max: 65535 },
  message_number: { integer: true, min: 0, max: 65535 },

  // Derived logger metrics and diagnostics.
  heatpump1_delta_t_k: { min: -300, max: 300 },
  pressure_ratio: { min: 0, max: 1000 },
  dhw_delta_target_k: { min: -300, max: 300 },
  heating_efficiency: { min: 0, max: 1000 },
  dhw_efficiency: { min: 0, max: 1000 },
  hp1_heating_efficiency: { min: 0, max: 1000 },
  hp1_dhw_efficiency: { min: 0, max: 1000 },
  live_poll_errors: { integer: true, min: 0, max: 2147483647 },
  energy_poll_errors: { integer: true, min: 0, max: 2147483647 },
  config_poll_errors: { integer: true, min: 0, max: 2147483647 },
  total_modbus_errors: { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
  device_uptime_s: { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
};

const BOOLEAN_FIELDS = new Set([
  "compressor1",
  "dhw_charging_pump",
  "buffer_charging_pump1",
  "heating_circuit1_pump",
  "dhw_circulation_pump",
  "defrost_initiated",
  "fixed_value_operation_enabled",
  "modbus_ok",
  "sd_ok",
]);

const TELEMETRY_FIELDS = new Set([
  ...Object.keys(NUMBER_FIELDS),
  ...BOOLEAN_FIELDS,
]);
const ALLOWED_FIELDS = new Set(["device_id", "timestamp", ...TELEMETRY_FIELDS]);

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function validateMeasurement(
  value: unknown,
  configuredDeviceId: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("payload must be a JSON object");
  }
  const payload = value as Record<string, unknown>;

  for (const [field, fieldValue] of Object.entries(payload)) {
    if (!ALLOWED_FIELDS.has(field)) throw new Error(`unknown field: ${field}`);
    if (fieldValue === null) throw new Error(`null is not allowed: ${field}`);
  }
  if (payload.device_id !== configuredDeviceId) {
    throw new Error("device_id does not match configured device");
  }

  if (typeof payload.timestamp !== "string") {
    throw new Error("timestamp must be a string");
  }
  // A timezone is mandatory; Date alone otherwise treats the value as local or UTC.
  const timestampPattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!timestampPattern.test(payload.timestamp)) {
    throw new Error("timestamp must be ISO 8601 with a timezone");
  }
  const parsedTimestamp = new Date(payload.timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new Error("timestamp is not a real calendar date");
  }
  // Date normalizes impossible dates, so compare the UTC components represented
  // by the input with the same instant after applying its explicit offset.
  const parts = payload.timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  )!;
  const calendarProbe = new Date(
    Date.UTC(
      +parts[1],
      +parts[2] - 1,
      +parts[3],
      +parts[4],
      +parts[5],
      +parts[6],
    ),
  );
  if (
    calendarProbe.getUTCFullYear() !== +parts[1] ||
    calendarProbe.getUTCMonth() + 1 !== +parts[2] ||
    calendarProbe.getUTCDate() !== +parts[3] ||
    calendarProbe.getUTCHours() !== +parts[4] ||
    calendarProbe.getUTCMinutes() !== +parts[5] ||
    calendarProbe.getUTCSeconds() !== +parts[6]
  ) {
    throw new Error("timestamp is not a real calendar date");
  }

  let telemetryCount = 0;
  for (const [field, rule] of Object.entries(NUMBER_FIELDS)) {
    if (!(field in payload)) continue;
    telemetryCount++;
    const number = payload[field];
    if (
      typeof number !== "number" || !Number.isFinite(number) ||
      (rule.integer && !Number.isInteger(number))
    ) {
      throw new Error(`${field} has an invalid numeric type`);
    }
    if (number < rule.min || number > rule.max) {
      throw new Error(`${field} is out of range`);
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in payload)) continue;
    telemetryCount++;
    if (typeof payload[field] !== "boolean") {
      throw new Error(`${field} must be a boolean`);
    }
  }
  if (telemetryCount === 0) {
    throw new Error("at least one telemetry field is required");
  }
  return payload;
}

async function tokensEqual(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(actualHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

async function readLimitedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new RangeError("body too large");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("body too large");
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

export function secretKeyFromEnvironment(env: Environment): string {
  const rawKeys = env.get("SUPABASE_SECRET_KEYS");
  if (!rawKeys) throw new Error("SUPABASE_SECRET_KEYS is not configured");
  const keys: unknown = JSON.parse(rawKeys);
  const keyName = env.get("ISG_SECRET_KEY_NAME") ?? "default";
  if (
    typeof keys !== "object" || keys === null || Array.isArray(keys) ||
    typeof (keys as Record<string, unknown>)[keyName] !== "string" ||
    !(keys as Record<string, string>)[keyName]
  ) {
    throw new Error(`Supabase secret key '${keyName}' is not configured`);
  }
  return (keys as Record<string, string>)[keyName];
}

export class SupabaseRestStore implements MeasurementStore {
  constructor(
    private readonly url: string,
    private readonly secretKey: string,
  ) {}

  async save(measurement: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.url}/rest/v1/measurements`, {
      method: "POST",
      headers: {
        "apikey": this.secretKey,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(measurement),
    });
    if (!response.ok) {
      throw new Error(`storage request failed with status ${response.status}`);
    }
  }
}

export function createHandler(
  store: MeasurementStore,
  env: Environment = Deno.env,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const expectedToken = env.get("ISG_INGEST_TOKEN");
    const actualToken = request.headers.get("X-ISG-Token") ?? "";
    if (!expectedToken || !(await tokensEqual(actualToken, expectedToken))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (
      request.headers.get("content-type")?.split(";", 1)[0].trim()
        .toLowerCase() !== "application/json"
    ) {
      return Response.json({ error: "content-type must be application/json" }, {
        status: 415,
      });
    }
    let text: string;
    try {
      text = await readLimitedBody(request);
    } catch (error) {
      if (error instanceof RangeError) {
        return Response.json({ error: "request body too large" }, {
          status: 413,
        });
      }
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return badRequest("invalid JSON");
    }
    let measurement: Record<string, unknown>;
    try {
      const deviceId = env.get("ISG_DEVICE_ID");
      if (!deviceId) {
        throw new Error("server device identity is not configured");
      }
      measurement = validateMeasurement(raw, deviceId);
    } catch (error) {
      return badRequest(
        error instanceof Error ? error.message : "invalid payload",
      );
    }
    try {
      await store.save(measurement);
    } catch {
      return Response.json({ error: "telemetry storage failed" }, {
        status: 502,
      });
    }
    return Response.json({ ok: true }, { status: 202 });
  };
}

if (import.meta.main) {
  const secretKey = secretKeyFromEnvironment(Deno.env);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  Deno.serve(createHandler(new SupabaseRestStore(supabaseUrl, secretKey)));
}
