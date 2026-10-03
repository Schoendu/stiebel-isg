# Grafana provisioning

This directory contains provisioning for the Supabase PostgreSQL datasource and
the STIEBEL dashboard provider.

## Datasource

`datasources/supabase-postgres.yml` uses environment variables only. Database
credentials must never be committed.

Required environment variables:

- `SUPABASE_DB_HOST`
- `SUPABASE_DB_PORT` (normally `5432`)
- `SUPABASE_DB_NAME` (normally `postgres`)
- `SUPABASE_DB_USER`
- `SUPABASE_DB_PASSWORD`

The datasource UID is fixed to `stiebel-supabase` so provisioned dashboards can
reference it reliably. The minimum query interval is one minute to match the
ESP32 upload cadence.

For Supabase deployments on IPv4-only networks, use the shared pooler in
**session mode** on port 5432. Copy the exact host from the Supabase Dashboard
**Connect** dialog; do not derive the pooler hostname manually.

## Read-only database identity

Migration `20261003170000_add_grafana_reader_role.sql` creates a NOLOGIN group
role named `grafana_reader`, grants it only schema usage and SELECT on
`public.measurements`, and adds the matching RLS SELECT policy.

Create the actual login role separately with a strong password so no credential
ever appears in Git. Grant that login membership in `grafana_reader`.

The recommended login role is `grafana_hems`. Set it to read-only by default
and use a short statement timeout.

## TLS

The provisioned datasource uses `sslmode=require`. This encrypts the database
connection and is the minimum recommended mode for a cloud-hosted PostgreSQL
database. A future hardening step can move to `verify-full` with an explicitly
managed CA certificate.
