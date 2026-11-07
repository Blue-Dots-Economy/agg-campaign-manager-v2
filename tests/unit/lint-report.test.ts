import { describe, expect, test } from "bun:test";
import { blockOf, formatReport, summarize } from "../../scripts/lint-report";

describe("blockOf", () => {
  test("puts server code in the server block", () => {
    for (const p of [
      "src/lib/raya.functions.ts",
      "src/lib/sheets.server.ts",
      "src/lib/raya-api.ts",
      "src/server/db/schema.ts",
      "src/auth/roles.ts",
      "src/routes/api/public/hooks/sync-snapshots.ts",
      "src/server.ts",
      "src/start.ts",
    ]) {
      expect(blockOf(p)).toBe("server");
    }
  });

  test("puts the rest of src in the web block", () => {
    expect(blockOf("src/routes/launch.tsx")).toBe("web");
    expect(blockOf("src/components/KpiCard.tsx")).toBe("web");
    expect(blockOf("src/lib/cohort.ts")).toBe("web");
  });

  test("keeps vendored ui, tests and tooling apart", () => {
    expect(blockOf("src/components/ui/button.tsx")).toBe("vendored");
    expect(blockOf("tests/unit/auth.test.ts")).toBe("tests");
    expect(blockOf("scripts/e2e/smoke.ts")).toBe("tooling");
    expect(blockOf("eslint.config.js")).toBe("tooling");
  });
});

describe("summarize", () => {
  const results = [
    {
      filePath: "/repo/src/lib/raya.functions.ts",
      messages: [
        { ruleId: "@typescript-eslint/no-explicit-any", severity: 1 },
        { ruleId: "@typescript-eslint/no-explicit-any", severity: 1 },
        { ruleId: "eqeqeq", severity: 2 },
      ],
    },
    {
      filePath: "/repo/src/routes/launch.tsx",
      messages: [{ ruleId: "@typescript-eslint/no-explicit-any", severity: 1 }],
    },
    { filePath: "/repo/src/routes/index.tsx", messages: [] },
  ];

  test("counts warnings and errors per rule and block", () => {
    const rows = summarize(results, "/repo");
    expect(rows).toEqual([
      { rule: "@typescript-eslint/no-explicit-any", block: "server", warnings: 2, errors: 0 },
      { rule: "@typescript-eslint/no-explicit-any", block: "web", warnings: 1, errors: 0 },
      { rule: "eqeqeq", block: "server", warnings: 0, errors: 1 },
    ]);
  });

  test("returns no rows for clean results", () => {
    expect(summarize([{ filePath: "/repo/src/a.ts", messages: [] }], "/repo")).toEqual([]);
  });

  test("labels parser messages without a rule", () => {
    const rows = summarize(
      [{ filePath: "/repo/src/a.ts", messages: [{ ruleId: null, severity: 2 }] }],
      "/repo",
    );
    expect(rows).toEqual([{ rule: "(parser)", block: "web", warnings: 0, errors: 1 }]);
  });
});

describe("formatReport", () => {
  test("prints one line per rule with totals", () => {
    const text = formatReport([
      { rule: "a", block: "server", warnings: 2, errors: 0 },
      { rule: "a", block: "web", warnings: 1, errors: 1 },
    ]);
    expect(text).toContain("a");
    expect(text).toContain("server 2w");
    expect(text).toContain("web 1w/1e");
    expect(text).toContain("total 3 warnings, 1 errors");
  });

  test("says when there is nothing to report", () => {
    expect(formatReport([])).toBe("No lint findings.");
  });
});
