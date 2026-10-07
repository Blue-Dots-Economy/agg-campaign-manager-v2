# Campaign Manager (Purple Dots): Supabase → Postgres, and server-side auth

**Date:** 2026-10-07
**Status:** Design. Sections 1–3 reviewed in discussion; sections 4–5 written after it and not yet reviewed.
**Repo:** `Blue-Dots-Economy/agg-campaign-manager-v2` (fork of `purpledotscampaigmanager`; Lovable is no longer used)
**Out of scope:** the Purple Dots loader (`campaign-manager-pipeline/purple_dots/load_purple.py`), which has its own plan. This doc only fixes the contract it must keep (§3.6).

## Goal

Run the Purple Dots campaign manager in our cluster on Postgres, with no Supabase or Lovable dependency, and with every request authenticated and authorised on the server. Users see the same screens and the same numbers.

**Done means**

- The app runs from the cluster against a database on the Postgres server Signals uses.
- No `@supabase/supabase-js`, no `src/integrations/supabase`, no `LOVABLE_*` variable remains.
- Every server function rejects a caller without a valid session (401) or with a role not allowed for it (403).
- The 13 dashboard functions return the same results as on Supabase for the same inputs, apart from the deliberate `channel` fix (§3.2).
- The schema lives in this repo as migrations; nobody edits the database by hand.

This is a first production launch, not a live switch: nothing is in production yet.

## Current state (findings)

Measured on the `campaign-manager-purpledots` Supabase project and this repo on 2026-10-07.

**Database:** 13 tables, 3 views, 31 functions, 0 RLS policies, no `pg_cron`, vault empty.

| Object | Notes |
| --- | --- |
| App tables (11) | `app_users` (5 rows), `reviewers` (0), `campaign_requests` (0), `launched_batches` (0), `launched_batch_inputs` (0), `north_star_config` (0), `program_agents` (1), `program_export_targets` (0), `program_sync_state` (2), `sheet_connections` (1), `transcript_reviews` (0) |
| Pipeline tables (2) | `purple_dots_calls` (877), `purple_dots_connections` (0). Written by the loader |
| `call_rows` (view) | Adapter that maps `purple_dots_calls` onto the jobs-programme columns the dashboards were built for. Excludes `test_flag` rows |
| `call_rows_np` (view) | `... FROM call_rows WHERE false`: always empty |
| `kkb_grid` (view) | Jobs-era seeker grid. Not referenced by the app |
| Dashboard functions (13) | `get_campaign_list`, `get_campaign_drop_causes`, `get_dkb_campaign_causes`, `get_dkb_drop_analysis`, `get_funnel_call_ids`, `get_funnel_durations`, `get_kkb_call_outcomes`, `get_kkb_drop_analysis`, `get_program_aggregate_payload`, `get_program_aggregates`, `get_program_metric_groups`, `get_program_metrics_raw`, plus `get_program_filter_options` (no `_np` twin). All `SECURITY DEFINER`, read `call_rows` |
| `_np` functions (12) | Identical to the above except they read `call_rows_np`. Never called by the app |
| Auth functions | `app_user_login`, `upsert_app_user` (pgcrypto bcrypt) |
| Helpers | `pd_norm_stage` (stage-name normaliser used by `call_rows`), 2 `updated_at` triggers, `rls_auto_enable` (event trigger) |
| Extensions | `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `plpgsql`, `supabase_vault` (unused) |

None of this SQL exists in either repo: `supabase/` holds only `config.toml` in the fork and the parent. The live database is the only copy.

**App:** TanStack Start (React + server functions in one Node container). 70 server functions in 16 files. 15 files talk to Supabase. 105 page/component files call server functions and do not touch Supabase directly.

**Security problems in the current app** (none in production yet):

1. Login state is JSON (`email`, `role`, ...) the browser writes itself, to `localStorage` and a JS-readable `rozgar_auth` cookie valid for a year. Not signed: anyone can set `"role":"admin"`.
2. No server function checks the caller. All run with the Supabase service-role key. `requireSupabaseAuth` exists but is unused.
3. `app_user_login` lets any user without a `password_hash` log in with their email alone, whatever their role.
4. Role checks (`canAccess`) run only in the browser. `upsertAppUser` can be called directly to create an admin.
5. `/api/public/hooks/sync-snapshots` is unauthenticated (`authenticateCronRequest` exists but is unused).

## Decisions

| # | Decision |
| --- | --- |
| D1 | Own password login. No Keycloak dependency |
| D2 | An admin creates users and gives them a first password. Users change their own password after login. No "forgot password" email; a forgotten password is reset by an admin |
| D3 | Session is a signed, httpOnly cookie carrying only the user id, expiring after 12 h. Every request reloads the user and requires `active` |
| D4 | Keep the 6 existing roles, enforced on the server per function |
| D5 | No data filtering by district/program (as today). Scope fields stay as stored information |
| D6 | Keep the 13 dashboard functions as SQL, moved unchanged into a migration |
| D7 | A separate database on the Postgres server Signals uses |
| D8 | Port like-for-like; drop only what is provably dead (`kkb_grid`, `call_rows_np`, the 12 `_np` functions) |
| D9 | The loader is a separate plan; this doc owns the table contract it must keep |
| D10 | One-time cutover with a write freeze (first launch) |
| D11 | Build order: database foundation → auth → data port → remaining services → deploy |

## 1. Architecture

```
Browser
  │  httpOnly signed cookie: cm_session = { uid, exp: 12h }
  ▼
campaign-manager container (one image, node-server build, in cluster)
  ├─ UI: pages and components (largely unchanged)
  └─ server functions (70)
        │  1. authMiddleware: verify cookie → load app_users row → active?
        │  2. requireRole([...]): role allowed for this function?
        ▼
     src/server/db/       Drizzle + pg  ──►  Postgres (Signals' server, own database)
                                              database: campaign_manager_purpledots
                                              users: migrator / cm_app / purple_loader
     src/server/sheets    Google Sheets (service account)
     src/server/storage   S3 (UP seekers cache)

Loader (separate plan) ──► purple_dots_calls (as purple_loader)
```

**New server-only modules (`src/server/`)**

| Module | Purpose | Depends on |
| --- | --- | --- |
| `db/` | Drizzle client (`pg` pool from `DATABASE_URL`), schema, migrations, typed wrappers for the SQL functions | Postgres |
| `auth/session.ts` | Sign/verify `cm_session` with `jose` (HS256, `SESSION_SECRET`) | none |
| `auth/password.ts` | Hash/verify with bcrypt (`bcryptjs`). Verifies the existing pgcrypto hashes unchanged | none |
| `auth/middleware.ts` | `authMiddleware` and `requireRole(...)` | `db`, `session` |
| `auth/roles.ts` | The 6 roles, the pages each may open, the roles each server function allows. Single source for server checks and UI page hiding | none |
| `sheets/` | Google Sheets read via the service account (replaces the Lovable connector gateway) | Google |
| `storage/` | S3 for the UP seekers CSV cache (replaces Supabase Storage) | S3 |

**Removed:** `src/integrations/supabase/*`, `src/lib/db.server.ts` (two-project routing, pilot email, `[routing-diag]` logs), `@supabase/supabase-js`, `LOVABLE_*` variables, the `rozgar_auth` cookie and `localStorage` session.

**Unchanged:** pages and components, React Query, server function signatures the pages call.

**Libraries:** `drizzle-orm` ^0.45, `drizzle-kit` ^0.31, `pg` ^8 (the versions Signals uses), `bcryptjs`. `jose` is already a dependency.

**Server-only environment:** `DATABASE_URL`, `MIGRATOR_DATABASE_URL` (migrations Job only), `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `RAYA_API_KEY`, `S3_BUCKET` and credentials, `CRON_SECRET`. No secret in any `VITE_` variable.

## 2. Authentication and users

### 2.1 Login

1. `/login` posts email and password to the `login` server function.
2. The server lowercases the email, loads `app_users`, and refuses when the user is missing, inactive, locked, has no password, or the password does not match. One generic message for every refusal ("Email or password is incorrect"), so it never reveals which emails exist.
3. On success it sets `cm_session`: signed `{ uid, exp: 12h }`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
4. If `must_change_password` is set, the user is sent to change-password and every other server function returns 403 until it is done.

### 2.2 Every server function

- `authMiddleware` verifies the cookie, loads the user, and returns 401 on a missing or invalid cookie or an inactive user.
- `requireRole([...])` returns 403 when the role is not allowed. The allowed roles come from `roles.ts`, derived from which pages use the function.
- Public functions are an explicit allowlist: `login` only. The sync hook authenticates with `CRON_SECRET`.
- POSTs whose `Origin` is not the app's own are rejected. With `SameSite=Lax`, this covers cross-site request forgery.
- A test fails the build if any `createServerFn` lacks `authMiddleware` and is not on the allowlist (§5).

### 2.3 Login protection

5 failed attempts lock the account for 15 minutes (`failed_login_count`, `locked_until`). A successful login resets the counter.

### 2.4 Users and passwords (Settings → Users, admin only on the server)

| Action | Behaviour |
| --- | --- |
| Create user | Admin enters email, name, role, scopes. The server generates a temporary password and shows it once; the admin sends it. `must_change_password = true` |
| Reset password | Admin clicks reset: a new temporary password is shown once, `must_change_password = true` |
| Change own password | Current password + new password (at least 10 characters) |
| Deactivate | `active = false`; takes effect on the user's next request |
| Guard rails | An admin cannot deactivate themself or demote/deactivate the last active admin |

Changing a password does not end other devices' sessions (D3). Deactivation does, on the next request.

### 2.5 Roles (unchanged from `src/auth/permissions.ts`)

| Role | Pages |
| --- | --- |
| `admin` | all, including Settings → Users |
| `jfc` | overview, campaigns, review, launch, ecosystem view, campaign requests, request campaign, user-level analysis |
| `coordinator` | overview, campaigns, review, request campaign, user-level analysis |
| `user` | overview, campaigns, review, user-level analysis |
| `owner` | overview, user-level analysis |
| `ecosystem` | ecosystem view, overview, user-level analysis |

### 2.6 UI changes

- `src/auth/context.tsx` stores nothing. It calls `me()` on load and `logout()` on sign-out.
- Page hiding reads `roles.ts`.
- The "admin must log in on every reload" special case is removed; sessions are protected and expire.
- The login page drops the "(admin only)" label: everyone has a password.

### 2.7 Data changes and removals

- `app_users`: add `must_change_password boolean not null default false`, `failed_login_count int not null default 0`, `locked_until timestamptz`.
- Remove `app_user_login`, `upsert_app_user`, and `resolveLogin`'s fallback to the legacy `reviewers` table.
- Remove the email-only path. A user with no password cannot log in until an admin sets one. All 5 users need one before go-live.
- Existing pgcrypto bcrypt hashes verify with `bcryptjs` unchanged.

## 3. Data layer

### 3.1 Schema into the repo

1. `pg_dump --schema=public --schema-only --no-owner --no-privileges` of the Supabase project, cleaned (§3.2), committed as migration `0000_baseline.sql`.
2. `drizzle-kit pull` against a database built from it generates `src/server/db/schema.ts`.
3. Every later change is a Drizzle migration in this repo.
4. One migration history per database: this repo owns all 13 tables, including `purple_dots_*`. A loader schema change is a migration here.

### 3.2 Baseline cleanup

| Removed | Changed |
| --- | --- |
| `call_rows_np`, `kkb_grid`, the 12 `_np` functions | `SECURITY DEFINER` → `SECURITY INVOKER`; the app user gets grants instead |
| `app_user_login`, `upsert_app_user` | `SET search_path TO 'public','extensions'` → `'public'` |
| `rls_auto_enable` and its event trigger | `extensions.uuid_generate_v4()` → `gen_random_uuid()` |
| `ENABLE ROW LEVEL SECURITY` on every table | `app_users`: the three columns in §2.7 |
| `supabase_vault` | `call_rows`: `lower(channel)` |

**The `channel` fix is a deliberate behaviour change.** The loader writes `Inbound`/`Outbound`, the UI filters on `inbound`/`outbound`, and the functions compare case-sensitively, so today the Inbound/Outbound filter matches nothing. Confirm before fixing: `select channel, count(*) from call_rows group by 1;`.

**Kept as-is:** the 11 app tables, 2 pipeline tables, `call_rows`, the 13 dashboard functions, `pd_norm_stage`, the 2 `updated_at` triggers, `pgcrypto` (only if still needed after §2.7, otherwise dropped), `pg_stat_statements`.

### 3.3 Database users

| User | Grants |
| --- | --- |
| `migrator` | Owns all objects. Used only by the migrations Job |
| `cm_app` | `select, insert, update, delete` on the 11 app tables; `select` on `purple_dots_calls`, `purple_dots_connections`, `call_rows`; `execute` on the dashboard functions and `pd_norm_stage` |
| `purple_loader` | `select, insert, update` on the 2 `purple_dots_*` tables. Nothing else |

The database and the three users are created once by a bootstrap script (`db/bootstrap.sql`) run by whoever administers the Signals Postgres server, because `migrator` cannot create roles.

### 3.4 Porting the app

- The 15 files that use Supabase move to Drizzle: `supabase.from(...)` → Drizzle queries; `.rpc(...)` → typed wrappers in `src/server/db/reports.ts`, one per SQL function, with zod-validated parameters.
- Server function signatures do not change, so pages do not change.

### 3.5 Kept features

Like-for-like (D8): Raya export, launched batches, campaign requests, transcript reviews, north-star config, program agents, sheet connections, the KKB/DKB dashboard functions, and UP seekers (its Sheets read moves to the service account, its cache to S3).

### 3.6 Loader contract (for the separate loader plan)

- `call_rows` reads these `purple_dots_calls` columns, which must not be renamed or dropped: `call_id, call_uuid, persona, call_date_ist, call_datetime_ist, call_value_score, contact_id, campaign_name, call_duration_seconds, call_answered, call_engaged, call_status, drop_reason, solution_enablers_discussed, providers_connected, connect_provider_api_triggered, matching_providers_found, abandoned_at_stage, loaded_at, channel, test_flag`. It also exposes every column through `to_jsonb(c.*)`.
- Never overwrite `test_flag` or `call_value_score`. `test_flag` decides which calls the dashboards hide; `call_value_score` is the dashboards' intent score.
- Connect as `purple_loader` directly to Postgres (not through a REST layer).
- Switch to Postgres in the same cutover window as the app (§4.5).

## 4. Deployment and cutover

*Written after the discussion; review needed.*

### 4.1 Image

- The existing `Dockerfile` already builds with `NITRO_PRESET=node-server` and publishes through `build-images.yaml`.
- Remove its reliance on the tracked `.env` for `VITE_SUPABASE_*`: nothing Supabase is inlined into the bundle any more.
- The image also carries the migrations and a `migrate` entrypoint for the migrations Job.

### 4.2 Helm chart (in `bluedots-automation`, like Signals and Aggregator)

- `Deployment` and `Service` for the app, `Ingress` for its host.
- A `pre-install`/`pre-upgrade` hook `Job` that runs migrations with `MIGRATOR_DATABASE_URL`.
- Secrets: `DATABASE_URL` (as `cm_app`), `MIGRATOR_DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `RAYA_API_KEY`, S3 credentials, `CRON_SECRET`.
- No CronJob: the Purple Dots project has no `pg_cron` job, and the sync reports itself disabled for this data source. The hook stays, protected by `CRON_SECRET`, so a CronJob can be added if a schedule is ever needed.

### 4.3 External services

- **S3:** one bucket (or prefix) for the UP seekers CSV and its metadata file.
- **Google Sheets:** the service account in `GOOGLE_SERVICE_ACCOUNT_JSON` must be granted read access to the UP seekers spreadsheet (`1J2WDeSO...`, in `src/lib/upSeekers.functions.ts`), which today is read through the Lovable gateway.

### 4.4 Environments

test-dev first, then production.

### 4.5 Cutover (first launch)

1. Announce a freeze; stop the loader and edits in the old app.
2. `pg_dump --data-only` of the kept tables; restore into the new database.
3. Check row counts (877 calls, 5 users, ...).
4. Run the parity script (§5.3); results must match apart from the `channel` fix.
5. Admin sets a password for every user without one.
6. Deploy the app; point the loader at Postgres as `purple_loader`.
7. Smoke test (§5.4).
8. Keep the Supabase project read-only until the numbers are confirmed, then retire it. Take down the parent repo's Lovable deployment.

## 5. Testing

*Written after the discussion; review needed.*

### 5.1 Unit

- Session: sign, verify, expiry, tampered cookie rejected.
- Password: verify a real pgcrypto `crypt(..., gen_salt('bf'))` hash fixture; hash and verify a new password.
- Lockout: 5 failures lock, success resets, lock expires.
- Roles: the role map matches §2.5.
- **Guard test:** enumerates every `createServerFn` and fails if one lacks `authMiddleware` and is not on the public allowlist.

### 5.2 Integration (CI, Postgres service container)

- Migrations apply from an empty database.
- Each `reports.ts` wrapper runs against seeded data.
- Grants: `cm_app` cannot write `purple_dots_calls`; `purple_loader` cannot read `app_users`.
- Auth end to end: login, `must_change_password` gate, 401 without a cookie, 403 for a disallowed role calling a server function directly, deactivation takes effect on the next request.

### 5.3 Parity (one-off, before cutover)

A script runs each dashboard function with the same parameter sets against Supabase and against the new database and diffs the JSON.

### 5.4 Smoke (after each deploy)

Log in as each role; open each page that role may open; confirm a page outside the role is refused; check the overview numbers against Supabase; log out.

## 6. Delivery

| PR | Contents |
| --- | --- |
| 1. Database foundation | Drizzle + `pg`, `0000_baseline.sql` (cleaned), generated schema, `db/bootstrap.sql`, migrations entrypoint, CI Postgres service, migration test |
| 2. Auth | `src/server/auth/*`, `login`/`logout`/`me`/change-password, admin create/reset/deactivate, `authMiddleware` on all 70 functions, roles map, guard test, UI context rewrite |
| 3. Data port | The 15 files to Drizzle, `reports.ts` wrappers, remove `src/integrations/supabase` and `db.server.ts`, remove `@supabase/supabase-js` |
| 4. Remaining services | Sheets via service account, S3 storage, sync hook behind `CRON_SECRET`, remove `LOVABLE_*` |
| 5. Deploy | Helm chart in `bluedots-automation`, Dockerfile changes, parity script, cutover runbook |

## Open items

1. Who runs `db/bootstrap.sql` on the Signals Postgres server in each environment, and the database name per environment.
2. The S3 bucket for the UP seekers cache, and how the pod gets credentials.
3. Grant the Google service account read access to the UP seekers spreadsheet.
4. Confirm the `channel` values (§3.2) before applying the fix.
5. The app's hostname per environment.
6. Coordinate cutover timing with the loader plan (§3.6).
