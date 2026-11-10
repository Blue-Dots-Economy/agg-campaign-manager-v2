#!/usr/bin/env bash
# Brings up the local e2e stack: a Postgres container, the app's database login,
# migrations, one user per role and sample call data. Safe to run again.
# Needs the variables from env.example.sh exported in the current shell.
set -euo pipefail

: "${E2E_PG_CONTAINER:?export the variables from scripts/e2e/env.example.sh first}"
: "${E2E_PG_PORT:?}" "${CM_DB_PASSWORD:?}" "${DATABASE_URL:?}" "${E2E_PASSWORD:?}"
for v in CM_DB_PASSWORD SESSION_SECRET CRON_SECRET; do
  [ "${!v}" != "change-me" ] || { echo "Set $v in your env file first." >&2; exit 1; }
done

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

if ! docker inspect "$E2E_PG_CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$E2E_PG_CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -p "127.0.0.1:${E2E_PG_PORT}:5432" \
    -v "${E2E_PG_CONTAINER}:/var/lib/postgresql/data" \
    --health-cmd "pg_isready -U postgres" --health-interval 2s \
    postgres:17-alpine >/dev/null
else
  docker start "$E2E_PG_CONTAINER" >/dev/null
fi

echo "Waiting for Postgres..."
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$E2E_PG_CONTAINER")" = healthy ] && break
  sleep 1
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$E2E_PG_CONTAINER")" = healthy ] \
  || { echo "Postgres did not become healthy." >&2; exit 1; }

psql_admin() { docker exec -i "$E2E_PG_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "Bootstrapping the database login..."
psql_admin -v campaign_manager_password="$CM_DB_PASSWORD" -f - < db/bootstrap.sql >/dev/null

echo "Applying migrations..."
bun run db:migrate

echo "Seeding users and sample calls..."
bun scripts/e2e/seed-users.ts
psql_admin -d campaign-manager-purpledots -f - < scripts/e2e/seed-calls.sql

echo "Done. Start the app with:"
echo "  bun x vite dev --port \"\$PORT\" --strictPort --host 127.0.0.1"
