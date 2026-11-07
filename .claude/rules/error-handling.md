# Rule: Error Handling

## External calls

Every call to an external system (Raya, Google Sheets, any other HTTP API) must have:

- **Timeout** — an explicit timeout on every call (`AbortSignal.timeout(...)`); never rely on the default.
- **Retry** — retry transient failures (429, 5xx, timeouts) at least once with exponential backoff. Do not retry a request that is not safe to repeat (for example creating a batch) unless the API supports an idempotency key.
- **Clear errors** — throw an `Error` subclass the caller can check (for example `RayaApiError` in `src/lib/raya-api.ts`, or a small `class UpstreamError extends Error {}` in the module), with the original error as `cause`. Never pass a raw upstream body or stack trace to the browser.
- **No silent swallowing** — never use an empty `catch`. Log and re-throw, or return a clear failure value. A `catch` that ignores an error on purpose states why in one line.

```typescript
// Wrong
try {
  await rayaFetch("/batches", body);
} catch {}

// Correct (illustrative; RAYA_TIMEOUT_MS is a named, configurable value)
try {
  await rayaFetch("/batches", body, { signal: AbortSignal.timeout(RAYA_TIMEOUT_MS) });
} catch (err) {
  console.error(
    JSON.stringify({ operation: "raya.createBatch", status: "failure", error: String(err) }),
  );
  throw new UpstreamError("Raya did not accept the batch", { cause: err });
}
```

## Server functions

- Validate input first and refuse bad input with a 400-class status before touching the database or an external system.
- Use `setResponseStatus` with the right status (400, 401, 403, 404, 409, 502) before throwing, as `src/auth/middleware.ts` does. The thrown message reaches the browser, so keep it short and free of internal details, SQL, or personal data.
- Database writes that must succeed or fail together run in one `db.transaction(...)`.
