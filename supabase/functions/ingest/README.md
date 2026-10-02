# ingest Edge Function

The `ingest` Edge Function accepts telemetry from the ESP32 at:

```text
POST /functions/v1/ingest
Content-Type: application/json
X-ISG-Token: <device token>
```

The request body is limited to 16 KiB. The function validates the JSON payload,
requires its `device_id` to match the configured `ISG_DEVICE_ID`, and writes the
measurement to `public.measurements`. Unknown fields and fields with `null`
values are rejected. `received_at` is server-owned and must not be included in
the payload.

For example, this is a valid payload for `ISG_DEVICE_ID=heatpump-main`:

```json
{
  "device_id": "heatpump-main",
  "timestamp": "2026-10-02T12:00:00Z",
  "can_bus_status": 0
}
```

## Authentication and configuration

`X-ISG-Token` is checked against the selected entry in
`SUPABASE_SECRET_KEYS`. Supabase automatically provides that environment
variable to Edge Functions as a JSON dictionary. The function uses the
`default` entry unless `ISG_SECRET_KEY_NAME` selects another dictionary key.
Secrets must not be stored in firmware source, browser clients, or this
repository.

JWT verification is disabled for this device-authenticated endpoint with
`verify_jwt = false` in `supabase/config.toml`; the function's token check is
therefore required for every request.
