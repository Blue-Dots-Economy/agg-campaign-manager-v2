// Input validation for server functions. Loaded by `.functions.ts` modules that the browser
// also imports, so server-only code is imported inside the failure path.
import type { z } from "zod";

/** First words of the message sent to the browser when input fails validation. */
export const INVALID_INPUT_MESSAGE = "Invalid input";

/** Most field paths named in one error message, to keep the message short. */
const MAX_PATHS_IN_MESSAGE = 5;

/** Placeholder path for an issue on the whole input rather than one field. */
const ROOT_PATH = "(root)";

/**
 * Builds a server-function input validator that parses with a Zod schema.
 * The message names the bad fields only; it never repeats the rejected values.
 *
 * @param schema - Schema for the input; unknown keys are dropped (Zod's default `strip`).
 * @returns A validator for `.inputValidator(...)` that resolves to the parsed input.
 * @throws {Error} From the validator, after setting HTTP status 400, when the input does not match.
 */
export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
): (input: z.input<S>) => Promise<z.output<S>> {
  return async (input) => {
    const result = await schema.safeParseAsync(input);
    if (result.success) return result.data;
    const paths = [
      ...new Set(result.error.issues.map((i) => (i.path.length ? i.path.join(".") : ROOT_PATH))),
    ];
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    setResponseStatus(400);
    throw new Error(`${INVALID_INPUT_MESSAGE}: ${paths.slice(0, MAX_PATHS_IN_MESSAGE).join(", ")}`);
  };
}
