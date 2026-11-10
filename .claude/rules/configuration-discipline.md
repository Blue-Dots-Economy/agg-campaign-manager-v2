# Rule: Configuration Discipline

No deployment-specific or environment-specific value may be hardcoded in source code.

- API base URLs, secrets, credentials, thresholds that differ by deployment, and feature flags come from environment variables, read in server-only code (`*.server.ts`, `src/server/**`, or inside a server function handler).
- Program-specific values (columns, KPIs, drop reasons, launch steps) come from the program config in `src/programs/` and the stored overrides, never from code inside a component.
- Validate an environment variable where it is read and fail with a clear message when a required one is missing (as `getDb()` does for `DATABASE_URL`). Read it once and reuse the value; do not re-parse it on every request.
- Never expose a secret through a `VITE_` variable. Vite bundles those into the browser.
- A new environment variable goes into the deployment config (Helm values or the deploy repo) in the same change, and into the list in `CLAUDE.md`.

```typescript
// Wrong
const RAYA_BASE_URL = "https://v1.getraya.app/api";
const apiKey = "sk-live-...";

// Correct: read in server-only code, fail clearly when missing
const baseUrl = process.env.RAYA_BASE_URL ?? DEFAULT_RAYA_BASE_URL;
const apiKey = process.env.RAYA_API_KEY;
if (!apiKey) throw new Error("RAYA_API_KEY is not set");
```

## Named values

A literal that sets a limit, a size, a duration, a count or a business rule needs a name and a reason. Ask three questions before you write one:

1. **Can it differ by deployment, program or load?** Then it is configuration (see above), with a named default. External-call timeouts and retry counts are always configuration (`error-handling.md`).
2. **Is the same rule used in more than one place?** Then it is one exported constant or helper, imported everywhere — for example the high-intent score threshold, or the concurrency cap used by both the UI and the server.
3. **Otherwise**, give it an `UPPER_CASE` constant next to the code that uses it, with a one-sentence TSDoc saying why it has that value.

- Do not leave a bare number in a condition, loop bound, `slice` length, timer or retry count.
- Keep the code and its comment in agreement. If the comment says "score of 5 or more", the code says `>= 5`.
- Literals that need no name: `0`, `1`, `-1`, HTTP status codes, unit conversions (`1000` ms, `60` s, `1024` bytes), fixed formats (`toISOString().slice(0, 10)`), and Zod limits inside an input schema (they are the contract).

```typescript
// Wrong
const highIntent = rows.filter((r) => r.intentScore >= 5);
await new Promise((r) => setTimeout(r, 2000));

// Correct
/** Intent score at or above which a seeker counts as high intent on every dashboard. */
export const HIGH_INTENT_MIN_SCORE = 5;
const highIntent = rows.filter((r) => r.intentScore >= HIGH_INTENT_MIN_SCORE);
await new Promise((r) => setTimeout(r, RAYA_RETRY_BASE_DELAY_MS));
```
