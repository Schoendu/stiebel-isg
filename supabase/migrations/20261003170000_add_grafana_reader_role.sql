do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'grafana_reader'
  ) then
    create role grafana_reader
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;
end
$$;

grant usage on schema public to grafana_reader;
grant select on table public.measurements to grafana_reader;

drop policy if exists measurements_grafana_read on public.measurements;

create policy measurements_grafana_read
  on public.measurements
  for select
  to grafana_reader
  using (true);

comment on role grafana_reader is
  'Read-only group role for Grafana telemetry queries. Login credentials are created separately and never committed.';
