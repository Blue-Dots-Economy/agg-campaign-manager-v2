// Reads numeric settings for external calls (timeouts, retry counts) from environment variables.

/**
 * Reads a whole-number setting from the environment, or returns the default when it is unset.
 *
 * @param env - Environment to read, usually `process.env`.
 * @param name - Variable name, used in the error message.
 * @param fallback - Value used when the variable is unset or blank.
 * @param min - Smallest allowed value.
 * @throws {Error} When the variable is set but is not a whole number of at least `min`.
 */
export function intFromEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of at least ${min}`);
  }
  return value;
}
