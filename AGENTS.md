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

## STIEBEL ISG Modbus constraints

- Modbus TCP port: 502
- Unit ID / slave ID: 1
- A documented STIEBEL register N maps to Modbus PDU address N-1.
- 0x8000 means value/object unavailable.
- 0x9000 is a special/non-numeric value for relevant registers and must not be decoded as a signed scaled measurement.

## Storage and networking

- microSD CSV logging remains enabled as a local fallback.
- The ESP32 may initiate outbound HTTPS connections.
- Do not expose the ESP32 or ISG directly to the Internet.
- Do not add inbound port-forwarding requirements.

## Security

- Never commit credentials, tokens, service-role keys, database passwords or device secrets.
- Use environment variables or deployment secrets.
- Browser/public clients must never receive privileged Supabase secrets.

## Code style

- Source code and comments are in English.
- Keep changes small and reviewable.
- Prefer explicit data contracts and migrations over implicit schema changes.
- Do not modify Modbus register mappings without measured evidence.
