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
    .replace(/[\s-]+/g, "_");
}

/** True when a Sheets error says the tab or range does not exist. */
export function isRangeParseError(msg: string): boolean {
  return /Unable to parse range|INVALID_ARGUMENT/i.test(msg);
}

/** An inclusive run of adjacent column indexes, `[first, last]`. */
export type ColumnGroup = [number, number];

/** Groups the indexes of headers not in `exclude` into runs of adjacent columns. */
export function columnGroups(headers: string[], exclude: ReadonlySet<string>): ColumnGroup[] {
  const groups: ColumnGroup[] = [];
  headers.forEach((h, i) => {
    if (exclude.has(normalizeHeader(h))) return;
    const last = groups.at(-1);
    if (last && last[1] === i - 1) last[1] = i;
    else groups.push([i, i]);
  });
  return groups;
}

/** Joins per-group column segments back into full rows; missing cells become "". */
export function joinSegments(groups: ColumnGroup[], segments: unknown[][][]): string[][] {
  const rowCount = segments.reduce((m, s) => Math.max(m, s.length), 0);
  const rows: string[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const out: string[] = [];
    groups.forEach(([s, e], g) => {
      const segRow = segments[g]?.[r] ?? [];
      for (let i = 0; i <= e - s; i++) {
        const v = segRow[i];
        out.push(v == null ? "" : String(v));
      }
    });
    rows.push(out);
  }
  return rows;
}
