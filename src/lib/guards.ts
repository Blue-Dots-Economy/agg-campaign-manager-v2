// Type guards for values that arrive as plain strings from UI widgets and the URL.

/**
 * Checks that a string is one of the allowed values, so it can be stored as their union type.
 *
 * @param values - The allowed values.
 * @param value - The string to check, for example from a Select or Tabs `onValueChange`.
 */
export function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return values.some((v) => v === value);
}
