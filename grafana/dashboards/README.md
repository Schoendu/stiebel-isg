# Grafana dashboards

`stiebel-isg-overview.json` is the first provisioned dashboard for the HEMS
telemetry stack.

It uses the fixed PostgreSQL datasource UID `stiebel-supabase` and a query
variable named `device`.

Included panels:

- current outside temperature
- current DHW temperature
- current thermal power
- compressor state
- latest upload age
- Modbus health
- outside / flow / return / DHW temperature trends
- thermal power and hydraulic flow rate
- refrigerant low/high pressure
- hot-gas temperature
- compressor, pump and defrost state timeline
- daily heat/electricity counters
- Modbus polling diagnostics

The default time range is 24 hours and the dashboard refresh interval is one
minute.
