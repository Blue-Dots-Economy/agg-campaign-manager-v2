# Rule: Logging and Observability

The app logs to stdout and stderr through `console`; there is no logging library. Server logs are collected from the container output.

- Do not leave `console.log` debugging output in committed code.
- Log significant server-side operations (external calls, batch launches, sync jobs, failed authorisation) as one line of JSON, so the log stack can parse it.
- Use `console.info` for normal milestones, `console.warn` for recoverable problems, `console.error` for failures that need attention.

Fields per entry:

| Field        | Description                           |
| ------------ | ------------------------------------- |
| `operation`  | Name of the function or step          |
| `status`     | `success`, `failure`, or `skipped`    |
| `error`      | Error message and type (failure only) |
| `latency_ms` | Elapsed ms (external calls)           |

```typescript
const start = Date.now();
// ... call ...
console.info(
  JSON.stringify({
    operation: "raya.createBatch",
    status: "success",
    latency_ms: Date.now() - start,
    program,
    contact_count: contacts.length,
  }),
);
```

## Personal data

Never log personal data: phone numbers, names, call transcripts, recordings, summaries, email addresses, passwords, session tokens or API keys. Log ids and counts instead. This also applies to error messages and to upstream response bodies, which often echo the request.
