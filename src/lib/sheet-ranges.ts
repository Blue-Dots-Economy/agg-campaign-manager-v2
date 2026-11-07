// Pure helpers for Google Sheets A1 ranges and header names.

/** Returns the column letter for a zero-based column index (0 → A, 26 → AA). */
export function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Returns the tab name as an A1 range prefix (`Tab!` or `'My Tab'!`). */
export function quoteTab(tab: string): string {
  if (/^[A-Za-z0-9_]+$/.test(tab)) return `${tab}!`;
  return `'${tab.replace(/'/g, "''")}'!`;
}

/** Lowercases a header and turns spaces and dashes into underscores, so headers match column keys. */
export function normalizeHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

/** True when a Sheets error says the tab or range does not exist. */
export function isRangeParseError(msg: string): boolean {
  return /Unable to parse range|INVALID_ARGUMENT/i.test(msg);
}
