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

Set `SUPABASE_URL`, `ISG_INGEST_TOKEN`, and the server-side Supabase secret used
by the function. `ISG_SECRET_KEY_NAME` selects the environment variable holding
that secret and defaults to `default`. For example:

```dotenv
ISG_SECRET_KEY_NAME=default
default=sb_secret_...
```

The secret is sent to PostgREST only in the `apikey` header. It is never sent to
the device or browser clients.
