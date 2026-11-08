// Checks that each lint rule in eslint.config.js fires, at the expected severity, on a small probe.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

const ROOT = join(import.meta.dir, "../..");
const WARN = 1;
const ERROR = 2;
const eslint = new ESLint({ cwd: ROOT });

/** Severities reported for one rule when `code` is linted as if it lived at `filePath`. */
async function severities(code: string, filePath: string, ruleId: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, filePath) });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.severity);
}

describe("type safety rules", () => {
  test("a cast in production code is reported", async () => {
    const code = "const x: unknown = 1;\nexport const y = x as number;\n";
    expect(
      await severities(code, "src/lib/probe.ts", "@typescript-eslint/consistent-type-assertions"),
    ).toEqual([ERROR]);
  });

  test("as const is allowed", async () => {
    const code = 'export const x = ["a"] as const;\n';
    expect(
      await severities(code, "src/lib/probe.ts", "@typescript-eslint/consistent-type-assertions"),
    ).toEqual([]);
  });

  test("a cast in a test file is allowed", async () => {
    const code = "const x: unknown = 1;\nexport const y = x as number;\n";
    expect(
      await severities(
        code,
        "tests/unit/probe.test.ts",
        "@typescript-eslint/consistent-type-assertions",
      ),
    ).toEqual([]);
    expect(
      await severities(
        code,
        "scripts/e2e/probe.ts",
        "@typescript-eslint/consistent-type-assertions",
      ),
    ).toEqual([]);
  });

  test("vendored ui components are not linted for casts", async () => {
    const code = "const x: unknown = 1;\nexport const y = x as number;\n";
    expect(
      await severities(
        code,
        "src/components/ui/probe.tsx",
        "@typescript-eslint/consistent-type-assertions",
      ),
    ).toEqual([]);
  });

  test("any is reported", async () => {
    expect(
      await severities(
        "export const f = (x: any) => x;\n",
        "src/lib/probe.ts",
        "@typescript-eslint/no-explicit-any",
      ),
    ).toEqual([ERROR]);
  });

  test("a non-null assertion is reported", async () => {
    const code = "export const f = (a: string[]) => a[0]!.length;\n";
    expect(
      await severities(code, "src/lib/probe.ts", "@typescript-eslint/no-non-null-assertion"),
    ).toEqual([ERROR]);
  });

  test("an unused variable is an error", async () => {
    const code = "export function f() {\n  const unused = 1;\n  return 2;\n}\n";
    expect(await severities(code, "src/lib/probe.ts", "@typescript-eslint/no-unused-vars")).toEqual(
      [ERROR],
    );
  });

  test("loose equality is an error", async () => {
    const code = "export const f = (a: number, b: number) => a == b;\n";
    expect(await severities(code, "src/lib/probe.ts", "eqeqeq")).toEqual([ERROR]);
    expect(
      await severities(
        "export const f = (a: unknown) => a == null;\n",
        "src/lib/probe.ts",
        "eqeqeq",
      ),
    ).toEqual([]);
  });

  test("type-only imports use import type", async () => {
    const code = 'import { Role } from "@/auth/roles";\nexport const r: Role = "admin";\n';
    expect(
      await severities(code, "src/lib/probe.ts", "@typescript-eslint/consistent-type-imports"),
    ).toEqual([ERROR]);
  });
});

describe("imports", () => {
  test("deep relative imports are an error", async () => {
    const code = 'import { x } from "../../lib/utils";\nexport const y = x;\n';
    expect(await severities(code, "src/components/a/probe.ts", "no-restricted-imports")).toEqual([
      ERROR,
    ]);
  });

  test("tests and scripts outside src may import src through relative paths", async () => {
    const code = 'import { ROLES } from "../../src/auth/roles";\nexport const r = ROLES;\n';
    expect(await severities(code, "tests/unit/probe.test.ts", "no-restricted-imports")).toEqual([]);
    expect(await severities(code, "scripts/e2e/probe.ts", "no-restricted-imports")).toEqual([]);
  });

  test("the Next.js server-only package is an error", async () => {
    expect(
      await severities('import "server-only";\n', "src/lib/probe.ts", "no-restricted-imports"),
    ).toEqual([ERROR]);
  });

  describe("cycles", () => {
    const dir = join(ROOT, "src/__cycle_probe__");
    beforeAll(() => {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "a.ts"), 'import { b } from "./b";\nexport const a = () => b;\n');
      writeFileSync(join(dir, "b.ts"), 'import { a } from "./a";\nexport const b = () => a;\n');
      writeFileSync(
        join(dir, "c.ts"),
        'import type { D } from "./d";\nexport type C = { d?: D };\n',
      );
      writeFileSync(
        join(dir, "d.ts"),
        'import type { C } from "./c";\nexport type D = { c?: C };\n',
      );
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test("a two-file runtime cycle is reported", async () => {
      const [result] = await eslint.lintFiles([join(dir, "a.ts")]);
      const found = (result?.messages ?? [])
        .filter((m) => m.ruleId === "import-x/no-cycle")
        .map((m) => m.severity);
      expect(found).toEqual([ERROR]);
    });

    test("a cycle closed only by type imports is not reported", async () => {
      const [result] = await eslint.lintFiles([join(dir, "c.ts")]);
      expect((result?.messages ?? []).filter((m) => m.ruleId === "import-x/no-cycle")).toEqual([]);
    });
  });
});

describe("react", () => {
  test("a hook in a condition is an error", async () => {
    const code =
      'import { useState } from "react";\nexport function C({ on }: { on: boolean }) {\n  if (on) useState(0);\n  return null;\n}\n';
    expect(
      await severities(code, "src/components/probe.tsx", "react-hooks/rules-of-hooks"),
    ).toEqual([ERROR]);
  });

  test("setting state directly in an effect is reported", async () => {
    const code =
      'import { useEffect, useState } from "react";\nexport function C({ v }: { v: number }) {\n  const [s, setS] = useState(0);\n  useEffect(() => {\n    setS(v);\n  }, [v]);\n  return s;\n}\n';
    expect(
      await severities(code, "src/components/probe.tsx", "react-hooks/set-state-in-effect"),
    ).toEqual([ERROR]);
  });

  test("an image without alt text is reported", async () => {
    const code = 'export const C = () => <img src="/a.png" />;\n';
    expect(await severities(code, "src/components/probe.tsx", "jsx-a11y/alt-text")).toEqual([WARN]);
  });

  test("accessibility rules the plugin leaves off stay off", async () => {
    const code = "export const C = () => <button><span /></button>;\n";
    expect(
      await severities(code, "src/components/probe.tsx", "jsx-a11y/control-has-associated-label"),
    ).toEqual([]);
  });

  test("a route file may export Route next to its local components", async () => {
    const code =
      'import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/probe")({ component: Page });\nfunction Page() {\n  return <div />;\n}\n';
    expect(
      await severities(code, "src/routes/probe.tsx", "react-refresh/only-export-components"),
    ).toEqual([]);
  });

  test("a component file that also exports a non-component is reported", async () => {
    const code =
      "export function makeThing() {\n  return 1;\n}\nfunction Page() {\n  return <div />;\n}\nexport default Page;\n";
    expect(
      await severities(code, "src/components/probe.tsx", "react-refresh/only-export-components"),
    ).toEqual([WARN]);
  });

  test("formatting is not an ESLint finding", async () => {
    const code = "export const x   =  1\n";
    expect(await severities(code, "src/lib/probe.ts", "prettier/prettier")).toEqual([]);
  });
});
