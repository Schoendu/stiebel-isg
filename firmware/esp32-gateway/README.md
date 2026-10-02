# ESP32-GATEWAY firmware

Target hardware: Olimex ESP32-GATEWAY Rev.C.

The existing local logger will be added here before cloud upload is implemented.

Required behavior to preserve:
- Rev.C LAN8720 Ethernet configuration documented in `AGENTS.md`
- Modbus TCP reads from the STIEBEL ISG
- local microSD CSV logging
- local diagnostics
- no inbound Internet exposure

Cloud ingestion is not implemented in the bootstrap commit.
