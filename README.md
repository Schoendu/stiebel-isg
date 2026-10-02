# STIEBEL ISG Telemetry

Telemetry stack for a STIEBEL ELTRON heat-pump installation.

## Architecture

```text
STIEBEL ISG
  -> Modbus TCP
Olimex ESP32-GATEWAY Rev.C
  -> HTTPS
Supabase PostgreSQL
  -> Grafana

The ESP32 also keeps local CSV logging on microSD as a fallback.
```

## Repository layout

- `firmware/esp32-gateway/` — ESP32 firmware
- `supabase/migrations/` — PostgreSQL schema and migrations
- `supabase/functions/ingest/` — secure telemetry ingestion endpoint
- `grafana/dashboards/` — Grafana dashboard definitions
- `grafana/provisioning/` — Grafana provisioning files
- `docs/` — architecture, data model and Modbus documentation

## Current milestone

The first milestone establishes the repository structure, telemetry data contract and initial Supabase schema. Cloud upload from the ESP32 is deliberately not implemented yet.

## Security principles

- The ESP32 initiates outbound HTTPS connections only.
- No inbound Internet exposure of the ESP32 or STIEBEL ISG.
- Secrets and credentials must never be committed.
- Local microSD CSV logging remains available as a fallback.

See `AGENTS.md` for hardware and protocol constraints that must be preserved by automated code changes.
