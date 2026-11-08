// Every server function uses requireRole or authMiddleware, unless listed here.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC = new Set(["login"]);
const SESSION_ONLY = new Set(["me", "logout", "changePassword"]);

const SRC = join(import.meta.dir, "../../src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

interface ServerFn {
  file: string;
  name: string;
  middleware: string[];
  /** Source of the argument passed to `.validator(...)`, when there is one. */
  validator: string | null;
}

/** Returns the source of the first call argument after `open`, matching nested brackets. */
function callArgument(chain: string, open: string): string | null {
  const start = chain.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start + open.length - 1; i < chain.length; i++) {
    const ch = chain[i];
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return chain.slice(start + open.length, i).trim();
  }
  return null;
}

/** True for a validator that only returns its argument, such as `(d: T) => d`. */
function isPassThrough(validator: string): boolean {
  return /^\(?\s*(\w+)\s*(?::[\s\S]*)?\)?\s*=>\s*\(?\s*\1\s*\)?$/.test(validator);
}

function serverFns(): ServerFn[] {
  const out: ServerFn[] = [];
  for (const path of sources(SRC)) {
    const text = readFileSync(path, "utf8");
    const roleConsts = new Set([...text.matchAll(/const (\w+) = requireRole\(/g)].map((m) => m[1]));
    for (const [, name = "", chain = ""] of text.matchAll(
      /export const (\w+) = createServerFn\([^)]*\)([\s\S]*?)\.handler\(/g,
    )) {
      const listed = [...chain.matchAll(/\.middleware\(\[([^\]]*)\]\)/g)].flatMap(([, list = ""]) =>
        list
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      const middleware = listed.map((x) =>
        roleConsts.has(x) || x.startsWith("requireRole(") ? "requireRole" : x,
      );
      const validator = callArgument(chain, ".validator(");
      out.push({ file: relative(SRC, path), name, middleware, validator });
    }
  }
  return out;
}

describe("server functions", () => {
  const fns = serverFns();

  test("are all found", () => {
    expect(fns.length).toBeGreaterThan(60);
  });

  test("each checks the caller", () => {
    const unguarded = fns
      .filter((f) => !PUBLIC.has(f.name))
      .filter((f) =>
        SESSION_ONLY.has(f.name)
          ? !f.middleware.includes("sessionMiddleware")
          : !f.middleware.some((m) => m === "requireRole" || m === "authMiddleware"),
      )
      .map((f) => `${f.file}: ${f.name}`);
    expect(unguarded).toEqual([]);
  });

  test("only the listed functions skip the password-change gate", () => {
    const sessionOnly = fns
      .filter((f) => f.middleware.includes("sessionMiddleware"))
      .map((f) => f.name);
    expect(sessionOnly.sort()).toEqual([...SESSION_ONLY].sort());
  });

  test("the public allowlist is exactly login", () => {
    const open = fns.filter((f) => f.middleware.length === 0).map((f) => f.name);
    expect(open).toEqual([...PUBLIC]);
  });

  test("none passes its input through unchecked", () => {
    const passThrough = fns
      .filter((f) => f.validator !== null && isPassThrough(f.validator))
      .map((f) => `${f.file}: ${f.name}`);
    expect(passThrough).toEqual([]);
  });

  test("each validator parses its input with parseInput", () => {
    const unparsed = fns
      .filter((f) => f.validator !== null && !f.validator.startsWith("parseInput("))
      .map((f) => `${f.file}: ${f.name}`);
    expect(unparsed).toEqual([]);
  });

  test("the pass-through check recognises the usual shapes", () => {
    expect(isPassThrough("(d) => d")).toBe(true);
    expect(isPassThrough("d => d")).toBe(true);
    expect(isPassThrough("(d: { program: ProgramId; force?: boolean }) => d")).toBe(true);
    expect(isPassThrough("(data: Array<Record<string, unknown>>) => data")).toBe(true);
    expect(isPassThrough("parseInput(programInput)")).toBe(false);
    expect(isPassThrough("(d: unknown) => schema.parse(d)")).toBe(false);
  });
});
