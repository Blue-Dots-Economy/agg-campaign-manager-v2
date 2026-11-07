// Input validation for server functions. Used only inside `.inputValidator(...)`, which the
// client build strips; server-only code is still imported inside the failure path.
import { z } from "zod";

/** First words of the message sent to the browser when input fails validation. */
export const INVALID_INPUT_MESSAGE = "Invalid input";

/** Most problems named in one error message, to keep the message short. */
const MAX_ISSUES_IN_MESSAGE = 5;

/**
 * Replaces Zod default messages that repeat the rejected value. Messages a schema sets itself
 * take precedence over this map and reach the browser as written.
 */
const noEchoErrorMap: z.ZodErrorMap = (issue, ctx) =>
  issue.code === z.ZodIssueCode.invalid_enum_value
    ? { message: "Invalid value" }
    : { message: ctx.defaultError };

function describeIssue(issue: z.ZodIssue): string {
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

/** Sets the HTTP status of the current server-function response. */
export type SetStatus = (status: number) => void | Promise<void>;

/**
 * Returns a `parseInput` that reports bad input through `setStatus`.
 * Tests pass a recorder; the app uses {@link parseInput}.
 */
export function createParseInput(setStatus: SetStatus) {
  /**
   * Builds a server-function input validator that parses with a Zod schema.
   * The message names each bad field with the schema's message; it never repeats rejected values.
   *
   * @param schema - Schema for the input; unknown keys are dropped (Zod's default `strip`).
   * @returns A validator for `.inputValidator(...)` that resolves to the parsed input.
   * @throws {Error} From the validator, after setting HTTP status 400, when the input does not match.
   */
  return function parseInput<S extends z.ZodTypeAny>(
    schema: S,
  ): (input: z.input<S>) => Promise<z.output<S>> {
    return async (input) => {
      const result = await schema.safeParseAsync(input, { errorMap: noEchoErrorMap });
      if (result.success) return result.data;
      const problems = [...new Set(result.error.issues.map(describeIssue))];
      await setStatus(400);
      throw new Error(
        `${INVALID_INPUT_MESSAGE}: ${problems.slice(0, MAX_ISSUES_IN_MESSAGE).join("; ")}`,
      );
    };
  };
}

/** Server-function input validator: parses with a Zod schema and answers 400 on bad input. */
export const parseInput = createParseInput(async (status) => {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(status);
});
