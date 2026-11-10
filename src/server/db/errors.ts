// Postgres reports a unique key clash as 23505. Drizzle wraps the driver's error,
// so the code may be on a cause.
/** True when `e`, or an error it wraps, is a Postgres unique key clash. */
export function isUniqueViolation(e: unknown): boolean {
  let x = e;
  for (let depth = 0; typeof x === "object" && x !== null && depth < 3; depth++) {
    if ("code" in x && x.code === "23505") return true;
    x = "cause" in x ? x.cause : undefined;
  }
  return false;
}
