// Prints ESLint warning and error counts per rule and per block (server, web, vendored, tests, tooling).
// Run: bun run lint:report
import { relative } from "node:path";
import { ESLint } from "eslint";

/** Part of the repo a file belongs to, used to track the lint ratchet per block. */
export type Block = "server" | "web" | "vendored" | "tests" | "tooling";

/** One rule's counts in one block. */
export interface ReportRow {
  rule: string;
  block: Block;
  warnings: number;
  errors: number;
}

/** The parts of an ESLint result this report reads. */
export interface LintResultLike {
  filePath: string;
  messages: { ruleId: string | null; severity: number }[];
}

const SERVER_FILES = /\.(functions|server)\.ts$/;
const SERVER_DIRS = ["src/server/", "src/auth/", "src/routes/api/"];
const SERVER_ENTRIES = new Set(["src/server.ts", "src/start.ts", "src/lib/raya-api.ts"]);
const ERROR_SEVERITY = 2;

/**
 * Returns the block for a repo-relative path.
 *
 * @param path - Path relative to the repo root, with forward slashes.
 */
export function blockOf(path: string): Block {
  if (path.startsWith("src/components/ui/")) return "vendored";
  if (path.startsWith("tests/") || /\.test\.tsx?$/.test(path)) return "tests";
  if (!path.startsWith("src/")) return "tooling";
  if (SERVER_FILES.test(path) || SERVER_ENTRIES.has(path)) return "server";
  if (SERVER_DIRS.some((dir) => path.startsWith(dir))) return "server";
  return "web";
}

/**
 * Counts findings per rule and block, sorted by rule, then block.
 *
 * @param results - ESLint results.
 * @param root - Repo root, used to make file paths relative.
 */
export function summarize(results: LintResultLike[], root: string): ReportRow[] {
  const rows = new Map<string, ReportRow>();
  for (const result of results) {
    const block = blockOf(relative(root, result.filePath).split("\\").join("/"));
    for (const message of result.messages) {
      const rule = message.ruleId ?? "(parser)";
      const key = `${rule}\u0000${block}`;
      const row = rows.get(key) ?? { rule, block, warnings: 0, errors: 0 };
      if (message.severity === ERROR_SEVERITY) row.errors += 1;
      else row.warnings += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) => a.rule.localeCompare(b.rule) || a.block.localeCompare(b.block),
  );
}

/** Formats rows as one line per rule, for a terminal or a PR description. */
export function formatReport(rows: ReportRow[]): string {
  if (rows.length === 0) return "No lint findings.";
  const byRule = new Map<string, ReportRow[]>();
  for (const row of rows) byRule.set(row.rule, [...(byRule.get(row.rule) ?? []), row]);
  const width = Math.max(...[...byRule.keys()].map((rule) => rule.length));
  const lines = [...byRule].map(([rule, ruleRows]) => {
    const cells = ruleRows.map(
      (r) => `${r.block} ${r.warnings}w${r.errors ? `/${r.errors}e` : ""}`,
    );
    return `${rule.padEnd(width)}  ${cells.join("  ")}`;
  });
  const warnings = rows.reduce((sum, r) => sum + r.warnings, 0);
  const errors = rows.reduce((sum, r) => sum + r.errors, 0);
  return [...lines, "", `total ${warnings} warnings, ${errors} errors`].join("\n");
}

if (import.meta.main) {
  const root = process.cwd();
  const results = await new ESLint({ cwd: root }).lintFiles(["."]);
  console.info(formatReport(summarize(results, root)));
}
