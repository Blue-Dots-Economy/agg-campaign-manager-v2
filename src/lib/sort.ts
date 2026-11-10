/** Orders two strings by UTF-16 code units, the same order `Array.prototype.sort` uses by default. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
