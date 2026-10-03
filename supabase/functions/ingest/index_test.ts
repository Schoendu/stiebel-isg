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

const FULL_PAYLOAD_FIELDS = [
  "hp1_heat_heating_today_kwh",
  "hp1_heat_heating_kwh_part",
  "hp1_heat_heating_mwh",
  "hp1_heat_dhw_today_kwh",
  "hp1_heat_dhw_kwh_part",
  "hp1_heat_dhw_mwh",
  "hp1_aux_heat_heating_kwh_part",
  "hp1_aux_heat_heating_mwh",
  "hp1_aux_heat_dhw_kwh_part",
  "hp1_aux_heat_dhw_mwh",
  "hp1_electricity_heating_today_kwh",
  "hp1_electricity_heating_kwh_part",
  "hp1_electricity_heating_mwh",
  "hp1_electricity_dhw_today_kwh",
  "hp1_electricity_dhw_kwh_part",
  "hp1_electricity_dhw_mwh",
  "hp1_aux_stage1_runtime_h",
  "hp1_aux_stage2_runtime_h",
  "hp1_aux_stage12_runtime_h",
  "sg_ready_enabled",
  "sg_ready_input1",
  "sg_ready_input2",
  "sg_ready_operating_state",
  "controller_identification",
  "heat_heating_today_kwh",
  "heat_heating_total_kwh_part",
  "heat_heating_total_mwh",
  "heat_dhw_today_kwh",
  "heat_dhw_total_kwh_part",
  "heat_dhw_total_mwh",
  "aux_heat_heating_kwh_part",
  "aux_heat_heating_mwh",
  "aux_heat_dhw_kwh_part",
  "aux_heat_dhw_mwh",
  "electricity_heating_today_kwh",
  "electricity_heating_kwh_part",
  "electricity_heating_mwh",
  "electricity_dhw_today_kwh",
  "electricity_dhw_kwh_part",
  "electricity_dhw_mwh",
  "heatpump1_return_c",
  "heatpump1_flow_c",
  "heatpump1_hotgas_c",
  "heatpump1_low_pressure_bar",
  "heatpump1_high_pressure_bar",
  "heatpump1_flowrate_lmin",
  "operating_mode",
  "hc1_comfort_temperature_c",
  "hc1_eco_temperature_c",
  "hc1_heating_curve_slope",
  "fixed_value_operation_c",
  "heating_bivalence_temp_c",
  "dhw_eco_temperature_c",
  "dhw_stages",
  "dhw_bivalence_temp_c",
  "operating_status",
  "power_off_status",
  "fault_status",
  "can_bus_status",
  "defrost_initiated",
  "active_error_number",
  "message_number",
  "heating_circuit1_pump",
  "buffer_charging_pump1",
  "dhw_charging_pump",
  "dhw_circulation_pump",
  "compressor1",
  "outside_temperature_c",
  "heating_circuit1_actual_c",
  "heating_circuit1_target_c",
  "return_temperature_actual_c",
  "fixed_temperature_target_c",
  "buffer_temperature_actual_c",
  "buffer_temperature_target_c",
  "dhw_actual_c",
  "dhw_target_c",
  "heating_application_limit_c",
  "dhw_application_limit_c",
  "heatpump1_delta_t_k",
  "thermal_power_kw",
  "pressure_ratio",
  "dhw_delta_target_k",
  "heating_efficiency",
  "dhw_efficiency",
  "hp1_heating_efficiency",
  "hp1_dhw_efficiency",
  "fixed_value_operation_enabled",
  "live_poll_errors",
  "energy_poll_errors",
  "config_poll_errors",
  "total_modbus_errors",
  "device_uptime_s",
  "modbus_ok",
  "sd_ok",
] as const;

const FULL_PAYLOAD_BOOLEAN_FIELDS = new Set([
  "defrost_initiated",
  "heating_circuit1_pump",
  "buffer_charging_pump1",
  "dhw_charging_pump",
  "dhw_circulation_pump",
  "compressor1",
  "fixed_value_operation_enabled",
  "modbus_ok",
  "sd_ok",
]);

function fullPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    device_id: "heat-pump-1",
    timestamp: "2026-10-02T12:34:56+02:00",
  };
  for (const field of FULL_PAYLOAD_FIELDS) {
    payload[field] = FULL_PAYLOAD_BOOLEAN_FIELDS.has(field) ? false : 0;
  }
  return payload;
}

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

Deno.test("accepts the complete normalized logger CSV payload", async () => {
  const store = new TestStore();
  const response = await createHandler(store, env)(request(fullPayload()));
  assertEquals(response.status, 202);
  assertEquals(store.saved.length, 1);
  assertEquals(
    Object.keys(store.saved[0]).length,
    FULL_PAYLOAD_FIELDS.length + 2,
  );
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
