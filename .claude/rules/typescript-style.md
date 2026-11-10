---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Rule: TypeScript Style

Applies to every TypeScript file you write or change.

## Type safety

- `strict` is on in `tsconfig.json`. Never weaken it, and never add `// @ts-ignore` or `// @ts-expect-error` to silence an error.
- No `any`. Use `unknown` plus narrowing for anything crossing a boundary: `catch (e)`, server function input, upstream responses, parsed JSON, CSV rows, sheet data.
- No `as` casts to claim a shape. Validate with Zod and let the parsed result carry the type. `as const` is fine.
- Index access can be `undefined` at runtime even when the type says otherwise (`arr[0]`, `record[key]`). Handle the missing case.
- Use `===`, never `==`.

```typescript
// ✅
const parsed = BatchSchema.safeParse(await res.json());
if (!parsed.success) throw new UpstreamError("Raya returned an unexpected batch shape");

// ❌
const batch = (await res.json()) as Batch;
```

## Type design

- Plain data — DTOs, config shapes, props — is an `interface` or `type`, not a class.
- Prefer string-literal unions over `enum`: `type BatchStatus = "scheduled" | "running" | "done"`. The `as const` array plus derived type in `src/auth/roles.ts` is the pattern to follow when the values are also needed at runtime.
- Derive types with `Pick`, `Omit`, `Partial`, `ReturnType`, `z.infer` instead of restating fields. Drizzle's `$inferSelect` / `$inferInsert` on the tables in `src/server/db/schema.ts` are the source of truth for row shapes.
- Model states as a discriminated union, not several optional fields that can contradict each other.

## Async

- `async`/`await`, not `.then()` chains.
- Every rejection is handled — see `error-handling.md`.
- Independent calls run in parallel with `Promise.all`, or `Promise.allSettled` when partial results are usable.
- Write `ids.map((id) => getRow(id))`, not `ids.map(getRow)` — `map` passes the index and the array as extra arguments.

## Modules and immutability

- Named exports. Route files export `Route` as TanStack Router requires.
- Import app code through the `@/` alias, not long relative paths.
- Never mutate an object or array that React renders from. Copy with spread, `map`, `filter`.
