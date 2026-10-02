# Secure telemetry ingestion

`ingest` is the only supported write path from an ESP32 to `public.measurements`.
It accepts outbound HTTPS requests; neither the ESP32 nor the ISG needs an inbound
port or direct database access.

## Request

```text
POST https://<project-ref>.supabase.co/functions/v1/ingest
Authorization: Bearer <device-ingest-token>
Content-Type: application/json
```

The body is one JSON object. The required identity fields are:

| Field | Contract |
| --- | --- |
| `device_id` | 1-64 characters; starts with an ASCII letter or digit and contains only letters, digits, `.`, `_`, or `-` |
| `timestamp` | Valid ISO 8601 timestamp containing `T` and either `Z` or an explicit `+/-HH:MM` timezone |

At least one optional measurement field is required. Unknown fields and `null`
values are rejected. Omit a measurement when the ISG reports it unavailable
(including raw `0x8000` or `0x9000` values); do not send those sentinels as decoded
measurements.

Optional finite numeric fields and accepted ranges:

| Fields | Range |
| --- | --- |
| `outside_temperature_c` | -100 to 100 |
| `heatpump1_flow_c`, `heatpump1_return_c`, `heatpump1_hotgas_c`, `dhw_actual_c`, `dhw_target_c` | -100 to 250 |
| `heatpump1_low_pressure_bar`, `heatpump1_high_pressure_bar` | 0 to 100 |
| `heatpump1_flowrate_lmin` | 0 to 1000 |
| `thermal_power_kw` | -1000 to 1000 |
| `heat_dhw_today_kwh`, `electricity_dhw_today_kwh`, `heat_heating_today_kwh`, `electricity_heating_today_kwh` | 0 to 1,000,000 |

Integer fields are `can_bus_status` (signed 32-bit), `live_poll_errors`,
`energy_poll_errors`, and `config_poll_errors` (non-negative signed 32-bit), and
`device_uptime_s` (non-negative JSON safe integer).

Boolean fields are `compressor1`, `dhw_charging_pump`,
`buffer_charging_pump1`, `heating_circuit1_pump`, `defrost_initiated`,
`modbus_ok`, and `sd_ok`.

Example:

```json
{
  "device_id": "plant-room-1",
  "timestamp": "2026-10-02T10:15:00+02:00",
  "outside_temperature_c": 8.4,
  "heatpump1_flow_c": 34.2,
  "heatpump1_return_c": 29.7,
  "compressor1": true,
  "can_bus_status": 1,
  "live_poll_errors": 0,
  "device_uptime_s": 86400,
  "modbus_ok": true,
  "sd_ok": true
}
```

Successful requests return `200 {"status":"accepted"}`. Re-sending the same
`(device_id, timestamp)` updates that row. The endpoint rejects malformed or
unauthorized requests and does not expose database error details.

## Secrets and deployment

Set `ISG_INGEST_TOKEN` as a long, randomly generated deployment secret. The
function also uses Supabase-provided `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Never put the service-role key in firmware, browser
code, documentation examples, or source control.

Deploy with Supabase's normal JWT gateway check disabled because devices use the
dedicated opaque token validated by this function:

```sh
supabase secrets set ISG_INGEST_TOKEN='<random-secret>'
supabase functions deploy ingest --no-verify-jwt
```

RLS remains enabled and `anon` and `authenticated` retain no direct table access.
The service-role credential is used only inside the function for the validated
upsert on `(device_id, timestamp)`.

## Local validation

```sh
cd supabase/functions/ingest
deno fmt --check
deno test
```
