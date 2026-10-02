# ingest Edge Function

Secure ingestion endpoint for ESP32 telemetry.

Requirements:

- accept outbound HTTPS POST requests from the ESP32
- authenticate with a dedicated device token
- validate payload shape and timestamp
- reject malformed or unauthorized requests
- insert/upsert into `public.measurements`
- keep privileged Supabase credentials server-side only

## Configuration

Set `SUPABASE_URL`, `ISG_DEVICE_ID`, `ISG_INGEST_TOKEN`, and
`SUPABASE_SECRET_KEYS`. The latter is the JSON dictionary supplied to Edge
Functions (for example `{"default":"sb_secret_..."}`), **not** an API key
string. `SUPABASE_SECRET_KEY_NAME` selects an entry and defaults to `default`.
The selected secret is used only by the server-side REST storage client.

Deploy with JWT verification disabled because devices authenticate with the
dedicated `X-ISG-Token` header:

```toml
[functions.ingest]
verify_jwt = false
```

Requests are limited to 16 KiB. Payloads require a timezone-qualified
timestamp and at least one allow-listed telemetry value. For example:

```json
{ "timestamp": "2026-10-02T20:00:00Z", "can_bus_status": 0 }
```
