# Telemetry data model

## measurements

One row represents one telemetry snapshot from the ESP32.

Primary key:
- `timestamp` — UTC timestamp supplied by the device.

Core groups:
- ambient and water temperatures
- refrigerant temperatures and pressures
- hydraulic flow and calculated thermal power
- DHW values
- compressor and pump states
- selected daily energy counters
- communication diagnostics

The first schema intentionally stores the most useful time-series values rather than every known Modbus register.

## Future tables

Potential later additions:
- `device_events` for errors, restarts, stale-data detection and state changes
- `configuration_snapshots` for slowly changing WPM/ISG settings
- daily rollups or materialized views for long-term Grafana queries

## Timestamp policy

Device payloads should use ISO 8601 timestamps with timezone information. PostgreSQL stores them as `timestamptz`.
