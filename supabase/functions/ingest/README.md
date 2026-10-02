# ingest Edge Function

Planned secure ingestion endpoint for ESP32 telemetry.

Requirements:
- accept outbound HTTPS POST requests from the ESP32
- authenticate with a dedicated device token
- validate payload shape and timestamp
- reject malformed or unauthorized requests
- insert/upsert into `public.measurements`
- keep privileged Supabase credentials server-side only

Implementation is intentionally deferred until the telemetry schema is reviewed.
