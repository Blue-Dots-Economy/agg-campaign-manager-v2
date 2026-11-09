# Local e2e environment. Copy it outside the repo, replace every change-me once
# (for example with `openssl rand -hex 16`), then `. ./env.sh` before setup.sh and smoke.ts.
# The values must stay the same between runs: the database login keeps the first password.
# Never commit real secrets.

# Postgres container started by setup.sh.
export E2E_PG_CONTAINER=campaign-manager-pg
export E2E_PG_PORT=5434

# App login used by the app, migrations and tests (created by db/bootstrap.sql).
export CM_DB_PASSWORD="change-me"
export DATABASE_URL="postgresql://campaign_manager:${CM_DB_PASSWORD}@127.0.0.1:${E2E_PG_PORT}/campaign-manager-purpledots"
export TEST_DATABASE_URL="${DATABASE_URL}"

export SESSION_SECRET="change-me"
export CRON_SECRET="change-me"

# Dev server port and the URL smoke.ts calls.
export PORT=3200
export E2E_BASE_URL="http://127.0.0.1:${PORT}"

# One password for every seeded e2e user (<role>@e2e.local). At least 10 characters.
export E2E_PASSWORD="change-me-e2e"

# Optional integrations. Raya launches and Sheets sync fail while these are unset.
# export RAYA_API_KEY=...
# export GOOGLE_SERVICE_ACCOUNT_JSON='{...}'
