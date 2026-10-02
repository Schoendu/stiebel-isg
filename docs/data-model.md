# Telemetry data model

## measurements

One row represents one telemetry snapshot from one ESP32 logger.

Primary key:
- `device_id` — stable logical identifier for the telemetry source
- `timestamp` — measurement timestamp supplied by the device

The composite key `(device_id, timestamp)` allows multiple devices or test loggers without changing the schema later.

Core groups:
- ambient and water temperatures
- refrigerant temperatures and pressures
- hydraulic flow and calculated thermal power
- DHW values
- compressor and pump states
- selected daily energy counters
- communication and logger diagnostics

Logger/communication diagnostics currently include:
- `can_bus_status`
- `live_poll_errors`
- `energy_poll_errors`
- `config_poll_errors`
- `device_uptime_s`
- `modbus_ok`
- `sd_ok`

The first schema intentionally stores the most useful time-series values rather than every known Modbus register.

## Security model

Row Level Security is enabled on `public.measurements`.

The bootstrap migration creates no public read or write policy and explicitly revokes table access from Supabase `anon` and `authenticated` roles.

Planned access paths:
- ESP32 writes through the dedicated authenticated `ingest` Edge Function using server-side privileges. Its exact JSON contract and deployment instructions are documented in [`supabase/functions/ingest/README.md`](../supabase/functions/ingest/README.md).
- Grafana reads through a dedicated read-only database identity or an equivalently restricted path.
- Privileged Supabase keys must never be embedded in firmware or browser clients.

## Stale data

A dedicated `data_stale` column is intentionally not part of the initial measurement schema.

The target ISG can keep returning successful Modbus responses while values are frozen. Staleness should therefore be derived from multiple dynamic live values plus communication diagnostics, and should preferably be recorded as a diagnostic/event once the detection algorithm is defined.

## Future tables

Potential later additions:
- `device_events` for errors, restarts, stale-data detection and state changes
- `configuration_snapshots` for slowly changing WPM/ISG settings
- daily rollups or materialized views for long-term Grafana queries

## Timestamp policy

Device payloads should use ISO 8601 timestamps with timezone information. PostgreSQL stores them as `timestamptz`.

The server also records `received_at` independently so transport delays and reconnect/backfill behavior can be diagnosed.
