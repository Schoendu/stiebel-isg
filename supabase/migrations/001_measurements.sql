create table if not exists public.measurements (
  timestamp timestamptz primary key,

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

  received_at timestamptz not null default now()
);

create index if not exists measurements_received_at_idx
  on public.measurements (received_at desc);

comment on table public.measurements is
  'Minute-level telemetry uploaded by the ESP32 STIEBEL ISG logger.';
