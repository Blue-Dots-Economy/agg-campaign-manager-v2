---
paths:
  - "src/routes/**"
  - "src/lib/**"
  - "src/auth/**"
  - "src/server/**"
  - "src/start.ts"
  - "src/server.ts"
  - "src/router.tsx"
---

# Rule: TanStack Start

The app is TanStack Start: file-based routes in `src/routes/` and server functions (`createServerFn`) in `src/lib/*.functions.ts`. This is not Next.js — there are no Server Components, `page.tsx`, `"use client"` or `server-only`.

## Routes

- Follow `src/routes/README.md` for file names. Never edit `src/routeTree.gen.ts`.
- Keep route components thin: read params, call hooks, compose components. Move reusable UI to `src/components/` and logic to `src/lib/`.
- Use `Link` / `useNavigate` for internal navigation. A bare `<a>` reloads the page.
- Route params and search params are untrusted input from the URL. Validate them (`validateSearch` with Zod, or parse before use) and never pass a raw string into a query or external call.
- Hiding a page or nav item with `canAccess` is for the UI only. The server function behind it must check the role itself.

## Server functions are public HTTP endpoints

- Every server function runs `requireRole(FN_ROLES.<name>)` or `authMiddleware`. Add the role entry to `FN_ROLES` in `src/auth/roles.ts`. `tests/unit/server-fn-guard.test.ts` fails if one is missing; do not add to its allow-lists without the user's approval.
- Validate input with `.validator(parseInput(Schema))` (`src/lib/validation.ts`): it parses with Zod and answers 400 with the bad field names. Shared schemas (program ids, contacts, JSON) live in `src/lib/input-schemas.ts` and `src/lib/json.ts`. A TypeScript type on the input is not validation; the browser can send anything. `tests/unit/server-fn-guard.test.ts` fails on a validator that does not use `parseInput`.
- Take the caller's identity and role from `context.user`, never from the input.
- POST server functions get a same-origin check from the middleware. Do not change state from a GET server function.
- Return only the fields the page needs. Never return password hashes, secrets, or other users' personal data the role may not see.

## Server-only code

- Database access, secrets and external API keys live in `*.server.ts` files or `src/server/**`, and are reached only from server function handlers, middleware `.server()` blocks or server routes.
- A module the browser also loads imports server-only code dynamically inside the handler (`await import("@/server/...")`), as `src/auth/middleware.ts` does.
- Never read `process.env` in code that runs in the browser. Never put a secret behind a `VITE_` prefix.

## Server routes

- Routes under `src/routes/api/` are raw HTTP handlers. Authenticate them explicitly — cron hooks use `authenticateCronRequest` from `src/server/auth/cron.server.ts` — and validate the body.

## Data access

- Use `getDb()` from `src/server/db/client.server.ts` and the Drizzle query builder. Build SQL with parameters (`sql\`... ${value}\``), never by joining strings.
- Schema changes go through `src/server/db/schema.ts` plus `bun run db:generate`; never edit an applied migration.
