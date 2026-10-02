create table if not exists public.measurements (
  device_id text not null
    check (length(device_id) between 1 and 64),
  timestamp timestamptz not null,

  outside_temperature_c real,

  heatpump1_flow_c real,
  heatpump1_return_c real,
  heatpump1_hotgas_c real,
  heatpump1_low_pressure_bar real,
  heatpump1_high_pressure_bar real,
  heatpump1_flowrate_lmin real,
  thermal_power_kw real,

  dhw_actual_c real,
  dhw_target_c real,

  compressor1 boolean,
  dhw_charging_pump boolean,
  buffer_charging_pump1 boolean,
  heating_circuit1_pump boolean,
  defrost_initiated boolean,

  heat_dhw_today_kwh real,
  electricity_dhw_today_kwh real,
  heat_heating_today_kwh real,
  electricity_heating_today_kwh real,

  can_bus_status integer,
  live_poll_errors integer,
  energy_poll_errors integer,
  config_poll_errors integer,

  device_uptime_s bigint
    check (device_uptime_s is null or device_uptime_s >= 0),
  modbus_ok boolean,
  sd_ok boolean,

  received_at timestamptz not null default now(),

  primary key (device_id, timestamp)
);

create index if not exists measurements_timestamp_idx
  on public.measurements (timestamp desc);

create index if not exists measurements_device_received_at_idx
  on public.measurements (device_id, received_at desc);

alter table public.measurements enable row level security;

-- Keep telemetry inaccessible to Supabase public client roles by default.
-- The future ingest Edge Function will write with a privileged server-side
-- identity. Grafana will use a separate read-only database identity.
revoke all on table public.measurements from anon, authenticated;

comment on table public.measurements is
  'Minute-level telemetry uploaded by ESP32 STIEBEL ISG loggers.';

comment on column public.measurements.device_id is
  'Stable logical identifier for the telemetry source.';

comment on column public.measurements.timestamp is
  'Measurement timestamp supplied by the device, stored as timestamptz.';

comment on column public.measurements.received_at is
  'Server-side timestamp when the telemetry row was stored.';
