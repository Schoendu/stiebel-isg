# STIEBEL ISG Modbus notes

These constraints are based on measurements from the target installation.

## Addressing

The documented STIEBEL register number is one-based relative to the Modbus PDU address used by the logger:

```text
PDU address = documented register - 1
```

Example:
- documented register 507 -> PDU address 506

Do not change this offset without measured evidence.

## Connection

- TCP port: 502
- unit ID: 1

## Special raw values

- `0x8000`: object/value unavailable
- `0x9000`: special/non-numeric value for relevant registers

These values must be handled before signed/scaled numeric conversion.

## Confirmed useful measurements

Examples currently used by the logger include outside temperature, return/flow temperatures, DHW actual/target, hot-gas temperature, refrigerant pressures, flow rate, compressor/pump states and energy counters.

The complete confirmed register inventory should be added from the discovery CSV before expanding firmware polling.
