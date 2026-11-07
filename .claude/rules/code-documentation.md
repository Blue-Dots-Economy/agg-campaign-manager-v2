# Rule: Code Documentation

Every exported function, class, constant and type must have a TSDoc comment. Unexported helpers should have one if the logic is non-obvious.

**Format:** Use TSDoc.

```typescript
/**
 * Creates a Raya batch for the given contacts and schedules it.
 *
 * @param input - Agent, contacts and call window for the batch.
 * @returns The Raya batch id.
 * @throws {UpstreamError} If Raya refuses the batch or times out after retries.
 */
export async function launchBatch(input: LaunchBatchInput): Promise<string> {
```

**Rules:**

- The first line is a single-sentence summary ending with a period.
- Add `@param` / `@returns` only when they say more than the name and type. Always document thrown errors (`@throws`).
- Do not restate the function name or describe _how_ it works — describe _what_ it does and _why_ the caller needs it.
- A module that is not obvious from its file name starts with a one- or two-line comment stating its role in the app.

**Style (doc blocks and inline comments):**

- State facts about the current code in short, simple sentences.
- No dramatic wording, metaphors, or emphasis (ALL-CAPS words, "deliberately", "NOTE:").
- No history: no "used to", "was renamed", "since #123", PR, issue, review or plan-phase references. Git and PRs hold history.
- Keep each `@param` / `@returns` / `@throws` to one short line.
- Do not add inline comments that restate the code.
- Keep real constraints, stated plainly (e.g. "Never log this value.", "Must run in the caller's transaction.").
- Keep a one-sentence reason for any non-obvious choice.
