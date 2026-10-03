# ESP32-GATEWAY firmware

Target hardware: Olimex ESP32-GATEWAY Rev.C.

The firmware preserves the existing local logger behavior and adds outbound
Supabase telemetry uploads after each one-minute LIVE poll.

Required behavior to preserve:
- Rev.C LAN8720 Ethernet configuration documented in `AGENTS.md`
- Modbus TCP reads from the STIEBEL ISG
- local microSD CSV logging
- local diagnostics and web UI
- no inbound Internet exposure

## Cloud telemetry

The uploader sends the complete available logger payload to:

`https://zocxinsxtfudedtvozkf.supabase.co/functions/v1/ingest`

The payload mirrors the current CSV contract: all 78 register values, derived
metrics, poll/error counters, and device diagnostics. Invalid or unavailable
Modbus values are omitted instead of being sent as `null`.

CSV field names are normalized for PostgreSQL, for example:
- `outside_temperature_C` -> `outside_temperature_c`
- `hp1_heat_heating_today_kWh` -> `hp1_heat_heating_today_kwh`
- `heatpump1_deltaT_K` -> `heatpump1_delta_t_k`

Cloud timestamps are UTC ISO 8601 values such as
`2026-10-03T13:42:00Z`. The existing local CSV timestamp format is unchanged.

## Local secrets

Copy the committed template and insert the same device token configured in the
Supabase Edge Function:

```sh
cp firmware/esp32-gateway/secrets.example.h \
  firmware/esp32-gateway/secrets.h
```

Edit `secrets.h` locally. It is ignored by Git and must never be committed.

## TLS requirement

The uploader verifies HTTPS using the built-in Mozilla CA bundle provided by
Arduino-ESP32 3.3.12 or newer. Do not replace this with `setInsecure()`.
