# Architecture

## Data flow

```text
STIEBEL ISG
   |
   | Modbus TCP, port 502, unit ID 1
   v
Olimex ESP32-GATEWAY Rev.C
   |\
   | \ local CSV backup on microSD
   |
   | outbound HTTPS
   v
Supabase ingestion endpoint
   |
   v
PostgreSQL
   |
   | read-only SQL access
   v
Grafana
```

## Design goals

- One-minute telemetry for dynamic heat-pump measurements.
- Local CSV fallback if Internet or cloud ingestion is unavailable.
- No inbound Internet exposure of the ESP32 or STIEBEL ISG.
- PostgreSQL remains the system of record for online history.
- Grafana is the primary visualization and analysis layer.
- Configuration values and events may use slower or event-driven storage later.

## Initial milestone

The bootstrap phase defines the repository, telemetry contract and database schema only. ESP32 cloud upload is intentionally deferred until the contract is reviewed.
