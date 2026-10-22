-- Run once per environment, as superuser:
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v campaign_manager_password=... -f db/bootstrap.sql
-- One login, campaign_manager, for the app, migrations and pipeline.

SELECT format('CREATE ROLE campaign_manager LOGIN PASSWORD %L', :'campaign_manager_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'campaign_manager')
\gexec

SELECT 'CREATE DATABASE "campaign-manager-purpledots" OWNER campaign_manager'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'campaign-manager-purpledots')
\gexec

REVOKE ALL ON DATABASE "campaign-manager-purpledots" FROM PUBLIC;

\connect "campaign-manager-purpledots"

ALTER SCHEMA public OWNER TO campaign_manager;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Written by the pipeline repo.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION campaign_manager;

-- Needs superuser; kept out of public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
