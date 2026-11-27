// Checks uploaded contact rows before a batch launch: required columns, phone format and duplicates.

/** Country code used when a row has none. */
export const DEFAULT_COUNTRY_CODE = "91";
/** Most problems returned to the page; the counts still cover every row. */
export const MAX_PROBLEMS_RETURNED = 500;
/** Sheet row number of the first data row; row 1 holds the headers. */
const FIRST_DATA_ROW_NUMBER = 2;
/** Digits in an Indian mobile number without the country code. */
export const MOBILE_DIGITS = 10;
/** Indian mobile numbers start with 6, 7, 8 or 9. */
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

const NAME_HEADERS = ["contact_name", "name", "seeker_name", "candidate_name"];
const PHONE_HEADERS = ["contact_phone", "phone", "mobile", "phone_number"];
const COUNTRY_CODE_HEADERS = ["country_code", "cc"];

/** A row that cannot be sent to Raya. */
export interface ContactProblem {
  row: number;
  reason: string;
  phone?: string;
  name?: string;
}

/** A row that can be sent to Raya, with its other columns as extras. */
export interface ValidContactRow {
  name: string;
  phone: string;
  cc: string;
  extras: Record<string, string>;
  rowIndex: number;
}

/** Result of checking an uploaded contact list. */
export interface ContactValidationReport {
  total: number;
  valid: number;
  invalid: number;
  missingCols: string[];
  problems: ContactProblem[];
  validRows: ValidContactRow[];
}

/** Checks contact rows: required name and phone columns, 10-digit mobile numbers, no duplicates. */
export function validateContactRows(headers: string[], rows: string[][]): ContactValidationReport {
  const lc = headers.map((h) => h.trim().toLowerCase());
  const find = (cands: string[]) => {
    for (const c of cands) {
      const i = lc.indexOf(c.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };
  const nameIdx = find(NAME_HEADERS);
  const phoneIdx = find(PHONE_HEADERS);
  const ccIdx = find(COUNTRY_CODE_HEADERS);

  const missingCols: string[] = [];
  if (nameIdx < 0) missingCols.push("contact_name");
  if (phoneIdx < 0) missingCols.push("contact_phone");

  const problems: ContactProblem[] = [];
  const validRows: ValidContactRow[] = [];
  const seen = new Map<string, number>();

  if (missingCols.length === 0) {
    rows.forEach((r, i) => {
      const rowNum = i + FIRST_DATA_ROW_NUMBER;
      const name = (r[nameIdx] ?? "").trim();
      const rawPhone = (r[phoneIdx] ?? "").trim();
      const cc =
        ccIdx >= 0
          ? (r[ccIdx] ?? "").replace(/[^\d]/g, "") || DEFAULT_COUNTRY_CODE
          : DEFAULT_COUNTRY_CODE;
      if (!name) {
        problems.push({ row: rowNum, reason: "missing contact_name" });
        return;
      }
      if (!rawPhone) {
        problems.push({ row: rowNum, reason: "missing contact_phone", name });
        return;
      }
      let digits = rawPhone.replace(/[^\d]/g, "");
      // Drop a leading country code.
      if (digits.startsWith(cc) && digits.length > MOBILE_DIGITS) digits = digits.slice(cc.length);
      if (digits.length !== MOBILE_DIGITS || !MOBILE_PATTERN.test(digits)) {
        problems.push({ row: rowNum, reason: `invalid phone: ${rawPhone}`, name });
        return;
      }
      const dupRow = seen.get(digits);
      if (dupRow !== undefined) {
        problems.push({ row: rowNum, reason: `duplicate of row ${dupRow}`, phone: digits, name });
        return;
      }
      seen.set(digits, rowNum);
      const extras: Record<string, string> = {};
      headers.forEach((h, j) => {
        if (j === nameIdx || j === phoneIdx || j === ccIdx) return;
        if (!h) return;
        extras[h] = r[j] ?? "";
      });
      validRows.push({ name, phone: digits, cc, extras, rowIndex: rowNum });
    });
  }

  return {
    total: rows.length,
    valid: validRows.length,
    invalid: problems.length,
    missingCols,
    problems: problems.slice(0, MAX_PROBLEMS_RETURNED),
    validRows,
  };
}
