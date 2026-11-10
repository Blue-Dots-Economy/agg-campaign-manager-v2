---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Rule: Testing Requirements

Tests run with Bun's built-in runner (`import { describe, expect, test } from "bun:test"`). Do not add Vitest or Jest.

| Folder        | What goes there                                                 | Run with          |
| ------------- | --------------------------------------------------------------- | ----------------- |
| `tests/unit/` | Pure logic, auth and role rules, repo-wide guards. No database. | `bun run test`    |
| `tests/db/`   | Migrations, SQL functions and reports against a real Postgres.  | `bun run test:db` |

Every change to logic covers three categories:

| Category          | What to test                                               |
| ----------------- | ---------------------------------------------------------- |
| Normal execution  | Correct output for valid, well-formed input                |
| Edge cases        | Empty input, boundary values, missing optional fields      |
| Failure scenarios | Upstream failure or timeout, invalid input, missing config |

- No real external calls (Raya, Google Sheets) in tests. Pass a fake client or stub `fetch` for the test, and restore it afterwards.
- Database tests read `TEST_DATABASE_URL` and skip when it is not set, as `tests/db/migrations.test.ts` does. Create and clean up their own rows.
- Name the test file after what it tests: `tests/unit/cohort.test.ts` tests `src/lib/cohort.ts`.
- A bug fix starts with a test that reproduces the bug.
- A new server function keeps `tests/unit/server-fn-guard.test.ts` green; do not weaken that test.

```bash
bun run test                          # unit tests
bun test tests/unit/auth.test.ts      # one file
bun test -t "refuses expired"         # one test by name
bun run test:db                       # database tests (need TEST_DATABASE_URL)
```
