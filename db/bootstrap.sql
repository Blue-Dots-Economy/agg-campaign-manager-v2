-- Run once per environment, as superuser:
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v migrator_password=... \
--     -v cm_app_password=... -v purple_loader_password=... -f db/bootstrap.sql

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', r, p)
FROM (VALUES ('migrator',      :'migrator_password'),
             ('cm_app',        :'cm_app_password'),
             ('purple_loader', :'purple_loader_password')) AS v (r, p)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
\gexec

SELECT 'CREATE DATABASE "campaign-manager-purpledots" OWNER migrator'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'campaign-manager-purpledots')
\gexec

REVOKE ALL ON DATABASE "campaign-manager-purpledots" FROM PUBLIC;
GRANT CONNECT ON DATABASE "campaign-manager-purpledots" TO migrator, cm_app, purple_loader;

\connect "campaign-manager-purpledots"

ALTER SCHEMA public OWNER TO migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cm_app, purple_loader;

-- Owned by the pipeline repo.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION purple_loader;

-- Needs superuser; kept out of public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
