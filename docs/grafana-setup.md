# Grafana setup

This project connects Grafana directly to Supabase PostgreSQL with a dedicated
read-only database identity.

## 1. Apply the reader-role migration

After merging the Grafana PR:

```sh
git switch main
git pull --ff-only origin main
npx --yes supabase@latest db push --dry-run
npx --yes supabase@latest db push
```

The migration creates `grafana_reader` as a NOLOGIN group role. It grants only
`USAGE` on the `public` schema and `SELECT` on
`public.measurements`. Because the table uses RLS, the migration also adds a
SELECT policy scoped to `grafana_reader`.

## 2. Create the login role

Generate a password locally and store it in a password manager. Do not commit or
paste it into issue/PR text.

```sh
openssl rand -base64 32
```

In the Supabase SQL Editor, run the following and replace the placeholder with
that password:

```sql
create role grafana_hems
  login
  password 'PASTE_RANDOM_PASSWORD_HERE'
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant grafana_reader to grafana_hems;

alter role grafana_hems
  set default_transaction_read_only = on;

alter role grafana_hems
  set statement_timeout = '15s';
```

If the role already exists, rotate the password with:

```sql
alter role grafana_hems
  password 'PASTE_NEW_RANDOM_PASSWORD_HERE';
```

## 3. Get the Supabase connection endpoint

For Grafana running on a typical IPv4 client/network, use the shared Supabase
**Session pooler**:

1. Open the Supabase project.
2. Click **Connect**.
3. Select **Session pooler**.
4. Copy the exact host.
5. Use port `5432` and database `postgres`.

For a custom role, the shared-pooler username is:

```text
grafana_hems.zocxinsxtfudedtvozkf
```

Do not use the main `postgres` account for Grafana.

## 4. Grafana datasource environment

Set these only in the Grafana runtime environment:

```text
SUPABASE_DB_HOST=<session-pooler-host>
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=grafana_hems.zocxinsxtfudedtvozkf
SUPABASE_DB_PASSWORD=<grafana_hems-password>
```

The provisioned datasource uses `sslmode=require` and a one-minute minimum
interval.

## 5. Dashboard

The provisioned dashboard is:

```text
grafana/dashboards/stiebel-isg-overview.json
```

Datasource UID:

```text
stiebel-supabase
```

The dashboard defaults to the last 24 hours, refreshes every minute and offers a
`device` variable for selecting the telemetry source.
