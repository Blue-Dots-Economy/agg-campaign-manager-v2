// Postgres reports a unique key clash as 23505. Drizzle wraps the driver's error,
// so the code may be on a cause.
export function isUniqueViolation(e: unknown): boolean {
  let x = e;
  for (let depth = 0; x && depth < 3; depth++) {
    if ((x as { code?: unknown }).code === "23505") return true;
    x = (x as { cause?: unknown }).cause;
  }
  return false;
}
