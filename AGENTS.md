# AGENTS.md

This repository contains firmware and infrastructure for a STIEBEL ELTRON heat-pump telemetry system.

## Non-negotiable hardware constraints

Board: Olimex ESP32-GATEWAY Rev.C, classic ESP32.

Ethernet configuration:
- PHY: LAN8720
- PHY address: 0
- MDC: GPIO23
- MDIO: GPIO18
- PHY power: -1
- Ethernet clock: GPIO0 input

Do not replace this with configuration for newer Olimex board revisions.

## microSD constraints

Olimex ESP32-GATEWAY Rev.C uses the older 4-bit SDMMC wiring.

- Use `SD_MMC.begin("/sdcard", false)` for the Rev.C board.
- Keep 4-bit SDMMC mode unless measured evidence on the target board proves otherwise.
- Do not copy 1-bit SDMMC or pin mappings from newer ESP32-GATEWAY revisions into this project.
- Local CSV logging on microSD remains a required fallback when cloud ingestion is unavailable.

## STIEBEL ISG Modbus constraints

- Modbus TCP port: 502
- Unit ID / slave ID: 1
- A documented STIEBEL register N maps to Modbus PDU address N-1.
- 0x8000 means value/object unavailable.
- 0x9000 is a special/non-numeric value for relevant registers and must not be decoded as a signed scaled measurement.
- Do not change register offsets or semantics without measured evidence from the target installation.

## Telemetry identity and timestamps

- Every cloud telemetry row must include a stable `device_id`.
- Device timestamps must be ISO 8601 with timezone information and are stored as PostgreSQL `timestamptz`.
- The database key is `(device_id, timestamp)`.
- Do not hard-code credentials, tokens or device secrets in firmware source.

## Stale-data detection

The ISG can continue answering Modbus while its live values are no longer updating from the WPM/CAN side.

- Do not declare data stale because one slowly changing value is unchanged.
- Stale detection should consider a fingerprint of multiple dynamic live values together with successful Modbus communication.
- CAN status and Modbus/poll diagnostics must remain observable.
- Prefer recording an explicit diagnostic/event when stale data is detected rather than silently rewriting measurements.

## Storage and networking

- The ESP32 may initiate outbound HTTPS connections.
- Do not expose the ESP32 or ISG directly to the Internet.
- Do not add inbound port-forwarding requirements.
- Supabase/PostgreSQL is the online system of record; microSD remains the local fallback.

## Security

- Never commit credentials, tokens, service-role keys, database passwords or device secrets.
- Use environment variables or deployment secrets.
- Browser/public clients must never receive privileged Supabase secrets.
- Public Supabase roles must not get direct write access to telemetry tables.
- Prefer a dedicated authenticated ingestion endpoint for device writes.
- Grafana should use a dedicated read-only database identity or an equivalently restricted data path.

## Code style

- Source code and comments are in English.
- Keep changes small and reviewable.
- Prefer explicit data contracts and migrations over implicit schema changes.
- Preserve the existing working firmware behavior before adding cloud features.
