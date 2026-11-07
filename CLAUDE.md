# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Repository

Purple Dots Campaign Manager — the operations dashboard for voice-AI job-outreach campaigns (KKB, DKB and further programs). A single TanStack Start app (React 19, Vite, file-based routing, server functions), with Postgres through Drizzle, deployed as a Node server image. It started as a Lovable project; `README.md` still holds the original Lovable brief.

## Coding principles

Behavioural guidelines to reduce common LLM coding mistakes (from [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)). They bias toward caution over speed; for trivial tasks, use judgment.

### 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Toolchain

- **Bun is required.** The lockfile is `bun.lock`. Do not use npm, pnpm or yarn, and do not commit another lockfile. `bunfig.toml` holds a 24-hour supply-chain guard (`minimumReleaseAge`); ask the user before adding a package to its exclude list.
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which already adds the TanStack Start, React, Tailwind, path-alias and Nitro plugins. Do not add them again.
- `src/routeTree.gen.ts` is generated. Do not edit it by hand.
- Prettier settings are in `.prettierrc` (double quotes, semicolons, 100 columns). The repository is formatted and CI fails on unformatted files; run `bun run format` before committing. The formatting commit is listed in `.git-blame-ignore-revs` (`git config blame.ignoreRevsFile .git-blame-ignore-revs`).

## Common commands

```bash
bun install --frozen-lockfile        # install exactly what is committed
bun run dev                          # local dev server
bun run typecheck                    # tsc --noEmit
bun run lint                         # ESLint; errors fail CI
bun run lint:report                  # lint findings per rule and block (server, web, vendored, tests, tooling)
bun run build                        # production build
bun run test                         # unit tests (tests/unit)
bun test tests/unit/auth.test.ts     # one test file
bun test -t "test name"              # one test by name
bun run test:db                      # database tests; need TEST_DATABASE_URL, else skipped
bun run db:generate                  # write a migration after changing src/server/db/schema.ts
bun run db:migrate                   # apply migrations to DATABASE_URL
```

The database login is created by `db/bootstrap.sql` (see the `migrations` job in `.github/workflows/ci.yaml` for the exact steps).

Local end-to-end checks: `scripts/e2e/` (`setup.sh` brings up Postgres in Docker and seeds one user per role plus sample calls; `smoke.ts` checks login, the server-function role matrix and dashboard numbers against a running dev server). The `campaign-manager-e2e` skill walks through it, including the browser checks per role.

## Architecture

- **Routes** — `src/routes/` is file-based routing; read `src/routes/README.md` for the naming rules. `__root.tsx` is the app shell. Pages check access with `canAccess` from `src/auth/roles.ts` to hide what a role may not open.
- **Server functions** — `src/lib/*.functions.ts` export `createServerFn` handlers. Every one must run `requireRole(...)` or `authMiddleware` from `src/auth/middleware.ts`; only `login` is public and only `me`, `logout` and `changePassword` are session-only. `tests/unit/server-fn-guard.test.ts` fails the build if a new server function skips the check. Roles and their allowed server functions are in `src/auth/roles.ts` (`FN_ROLES`).
- **Server-only code** — modules named `*.server.ts` (and `src/server/**`) never reach the browser. Client-reachable modules import them dynamically inside `.server()` / handlers. Do not import the Next.js `server-only` package; ESLint blocks it.
- **Auth** — a signed session cookie (`cm_session`, `jose`, `SESSION_SECRET`), with users in `app_users` and bcrypt passwords. A same-origin check runs on every POST server function.
- **Database** — Drizzle schema in `src/server/db/schema.ts`, migrations in `src/server/db/migrations/`. Change the schema, then run `bun run db:generate` and commit the SQL and snapshot together; CI fails on drift. `getDb()` in `client.server.ts` is the only way to get a connection.
- **External systems** — the Raya voice API (`src/lib/raya-api.server.ts`, `RAYA_API_KEY`) and Google Sheets (`src/lib/sheets.server.ts`, `GOOGLE_SERVICE_ACCOUNT_JSON`). Cron endpoints under `src/routes/api/` authenticate with `CRON_SECRET` (`src/server/auth/cron.server.ts`).
- **Programs** — program-specific columns, KPIs and drop reasons come from config (`src/programs/`, `src/lib/program-overrides.ts`), not from code in components.

Environment variables read today: `DATABASE_URL`, `MIGRATOR_DATABASE_URL`, `SESSION_SECRET`, `RAYA_API_KEY`, `RAYA_BASE_URL`, `RAYA_TIMEOUT_MS`, `RAYA_WRITE_TIMEOUT_MS`, `RAYA_RETRIES`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEETS_TIMEOUT_MS`, `SHEETS_RETRIES`, `CRON_SECRET`, `CRON_SECRET_PREVIOUS`. Never put a secret behind a `VITE_` prefix; those values are bundled into the browser.

## Project rules (`.claude/rules/`)

Apply them to every line you write or change. Existing code does not meet all of them yet; do not rewrite untouched code to comply unless asked (see "Surgical changes"). Some rules always load; others load only when you touch a matching file (frontmatter `paths:`).

- **`error-handling.md`**, **`logging-observability.md`**, **`configuration-discipline.md`**, **`code-documentation.md`**, **`pull-requests.md`** — always loaded. Timeouts, retries and clear errors on external calls; structured logs with no personal data; no hardcoded deployment values and named constants for every limit; TSDoc on exported code; small PRs into `main`.
- **`typescript-style.md`** — `**/*.ts(x)`. No `any`, no unchecked `as` casts (validate with Zod), string-literal unions, discriminated unions, `Promise.all`.
- **`tanstack-start.md`** — `src/routes/**`, `src/lib/**`, `src/auth/**`, `src/server/**`. Server functions are public endpoints: guard, validate input, keep secrets server-side.
- **`react-components.md`** — `src/**/*.tsx`, `src/hooks/**`. Small components, stable keys, derive instead of mirroring state, no data fetching in `useEffect`.
- **`testing-requirements.md`** — test files. `bun:test`, normal, edge and failure cases, no real external calls.

## CI

`.github/workflows/ci.yaml` runs on every PR and every push to `main`. Blocking: `typecheck`, `build`, `lint` (ESLint errors and Prettier), `migrations` (bootstrap, migrate, schema drift, `bun test tests`) and `smoke-image` (builds and boots the Docker image). Advisory: `sonar`. Images are published by `build-images.yaml` on release tags only.

Type-safety rules (no casts, no `any`, no non-null assertions, `import type`, unused variables) and React hook rules are errors. Accessibility and react-refresh rules are warnings; do not add new ones. `tsconfig.json` has `strict` and `noUncheckedIndexedAccess` on.

## Commits and pull requests

- Branch from `main` and open the PR into `main`. Never push to `main` directly.
- Commit messages: a short Conventional Commits subject (e.g. `fix(auth): refuse expired sessions`), with a brief body only when the reason isn't obvious. Stage specific files, not `git add .`. Do not bypass hooks with `--no-verify`.
- **No AI attribution.** Do not add `Co-Authored-By: Claude`, `Generated with Claude Code`, or any other AI/assistant trailer to commit messages or PR descriptions.
- PR descriptions use plain, everyday English with the headings Summary, Release Notes and Checklist. Include an **In Plain Terms** section: what the problem was and what the change does, for a non-technical teammate. Skip it only for a pure chore with no behavioural effect. See `.claude/rules/pull-requests.md` for size limits.
