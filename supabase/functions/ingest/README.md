# ingest Edge Function

Secure ingestion endpoint for ESP32 telemetry.

The function:
- accepts outbound HTTPS POST requests from the ESP32
- authenticates the dedicated device token in the `X-ISG-Token` header
- only accepts the device configured by `ISG_DEVICE_ID`
- validates payload shape and timestamp
- rejects malformed or unauthorized requests
- upserts into `public.measurements`
- keeps the `SUPABASE_SECRET_KEYS` secret key server-side only

Example:

```sh
curl --request POST "$SUPABASE_URL/functions/v1/ingest" \
  --header "Content-Type: application/json" \
  --header "X-ISG-Token: $ISG_INGEST_TOKEN" \
  --data '{
    "device_id": "heatpump-main",
    "timestamp": "2026-10-02T12:34:56Z",
    "can_bus_status": 0,
    "modbus_ok": true
  }'
```

For this installation, `can_bus_status=0` is the healthy state.
