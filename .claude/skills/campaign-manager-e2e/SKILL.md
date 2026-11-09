---
name: campaign-manager-e2e
description: Use when the user wants to run or validate campaign-manager end to end locally — after a change, before a PR, or to check that every role can sign in and sees the right pages. Brings up Postgres in Docker, seeds one user per role and sample calls, runs the HTTP smoke test (login, server-function role matrix, same-origin check, dashboard numbers) and walks each role through the UI with chrome-devtools. Triggers: "run e2e", "validate the campaign manager", "test all roles", "check it still works locally".
---

# Campaign manager — local end-to-end validation

Two halves that catch different things:

- **`scripts/e2e/smoke.ts`** (HTTP, about 30 seconds) — every role signs in through the real `login` server function; every read-only (GET) server function is called as every role and must allow exactly the roles in `FN_ROLES`; a cross-site POST is refused; the seekers call count on the dashboard matches the database. It reads the server functions and their role groups from `src/`, so new functions are covered without editing the script.
- **chrome-devtools walk** — each role signs in through the login form, lands on its page, sees only its nav items and is redirected away from a page it may not open. This catches UI wiring the HTTP half cannot see.

## Ground rules

- Never edit a tracked file or `.env` to make a run pass. A run leaves the working tree clean.
- Keep secrets in an env file outside the repo. Do not print `E2E_PASSWORD` or session cookies into PRs or issues.
- The smoke test targets the **dev server** (`vite dev`). Server-function ids differ in a production build.
- Seeded users are `<role>@e2e.local`; seeded calls carry `batch_id = 'seed-local'`. Both are reset on every `setup.sh` run.

## Step 1 — Environment

Look for an existing env file first (the workspace keeps one at `testing/campaign-manager-local/env.sh`). Otherwise copy `scripts/e2e/env.example.sh` outside the repo, replace every `change-me` once, and keep it. Then, in the shell that runs everything:

```bash
. /path/to/env.sh
```

## Step 2 — Stack

```bash
./scripts/e2e/setup.sh        # Postgres container, bootstrap, migrations, users, sample calls
bun x vite dev --port "$PORT" --strictPort --host 127.0.0.1   # run in the background
```

Pick a free port first (`lsof -nP -iTCP:$PORT -sTCP:LISTEN`); other local stacks often hold 3000, 5432 and 8080. Wait until `curl -s -o /dev/null -w '%{http_code}' "$E2E_BASE_URL/login"` prints `200`.

## Step 3 — HTTP smoke

```bash
bun scripts/e2e/smoke.ts
```

Every line must be `PASS`. Exit code is non-zero on any `FAIL`. A `SKIP` means the dev server could not register that function; read its log before treating it as harmless.

A matrix failure such as `listCampaignRequests (launch) allows exactly admin,jfc (coordinator:200 ...)` means a role that is not in `FN_ROLES.launch` got data — a real access bug. A `401`/`403` for a role that should be allowed means the guard is stricter than the pages that call it.

## Step 4 — UI walk with chrome-devtools

For each role, open a fresh isolated context so sessions do not mix:

1. `new_page` → `$E2E_BASE_URL/login` with `isolatedContext: "cm-<role>"`.
2. `wait_for` `["Sign in"]`, `take_snapshot`, `fill_form` the Email and Password boxes, `click` Sign in.
3. Check where it landed and what the sidebar offers:

```js
async () => {
  for (let i = 0; i < 40 && location.pathname === "/login"; i++)
    await new Promise((r) => setTimeout(r, 250));
  return {
    url: location.pathname,
    nav: [...document.querySelectorAll("aside a")].map((a) => a.getAttribute("href")),
  };
};
```

4. `navigate_page` to one route the role may not open (from `ROLE_ROUTES` in `src/auth/roles.ts`, for example `/launch` for coordinator) and confirm it redirects to the landing page.
5. For admin, open `/` and confirm the KPIs show the seeded numbers (for example 640 calls for Seekers) and `list_console_messages` has no errors.

Expected landing pages come from `DEFAULT_LANDING` in `src/auth/roles.ts`:

| Role                      | Lands on               |
| ------------------------- | ---------------------- |
| admin, coordinator, owner | `/user-level-analysis` |
| jfc, user                 | `/`                    |
| ecosystem                 | `/ecosystem-view`      |

Read the table from the code each run; it changes when roles change.

Known behaviour, not a failure:

- The sidebar shows **Settings** to every role, but only admin may open `/settings`; others are redirected.
- The console shows one React hydration warning about `className="dark"` on `<html>` (the theme class is set in the browser). Report any other console error.

## Step 5 — Report

List what passed, every failure with its detail line, anything skipped and why, and screenshots for UI failures (save them under the workspace's `testing/` folder, not in the repo). Stop the dev server and `docker stop "$E2E_PG_CONTAINER"` if the user does not need them running.
