// Contact CSV handling for the launch wizard: a simple split for the preview and region guesses.

/** Header and data rows of an uploaded contact CSV. */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Rows shown in the upload preview table. */
export const CSV_PREVIEW_ROW_LIMIT = 20;

/** Calling regions the wizard knows, with the language and city sent to Raya and stored. */
export const REGION_INFO = {
  KA: { language: "Kannada", city: "Hubli-Dharwad" },
  GZB: { language: "Hindi", city: "Ghaziabad" },
} as const;

/**
 * Splits CSV text into trimmed headers and cells on commas and line breaks.
 * Quoted fields are not supported; the server validates the rows.
 */
export function parseLaunchCsv(text: string): ParsedCsv {
  const [headerLine = "", ...rowLines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map((h) => h.trim());
  const rows = rowLines.map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

/** Guesses the calling region from the file name; Karnataka names map to KA, the rest to GZB. */
export function detectRegion(filename: string): { region: string; language: string; city: string } {
  const f = filename.toLowerCase();
  if (f.includes("ka") || f.includes("kannada") || f.includes("hubli")) {
    return { region: "KA", ...REGION_INFO.KA };
  }
  return { region: "GZB", ...REGION_INFO.GZB };
}

/** Returns the language and city for a region, or empty strings for an unknown region. */
export function regionInfo(region: string): { language: string; city: string } {
  if (region === "KA") return REGION_INFO.KA;
  if (region === "GZB") return REGION_INFO.GZB;
  return { language: "", city: "" };
}
