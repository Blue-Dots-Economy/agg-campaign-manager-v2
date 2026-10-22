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
}

function serverFns(): ServerFn[] {
  const out: ServerFn[] = [];
  for (const path of sources(SRC)) {
    const text = readFileSync(path, "utf8");
    const roleConsts = new Set([...text.matchAll(/const (\w+) = requireRole\(/g)].map((m) => m[1]));
    for (const m of text.matchAll(/export const (\w+) = createServerFn\([^)]*\)([\s\S]*?)\.handler\(/g)) {
      const listed = [...m[2].matchAll(/\.middleware\(\[([^\]]*)\]\)/g)].flatMap((x) =>
        x[1].split(",").map((s) => s.trim()).filter(Boolean),
      );
      const middleware = listed.map((x) => (roleConsts.has(x) || x.startsWith("requireRole(") ? "requireRole" : x));
      out.push({ file: relative(SRC, path), name: m[1], middleware });
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
    const sessionOnly = fns.filter((f) => f.middleware.includes("sessionMiddleware")).map((f) => f.name);
    expect(sessionOnly.sort()).toEqual([...SESSION_ONLY].sort());
  });

  test("the public allowlist is exactly login", () => {
    const open = fns.filter((f) => f.middleware.length === 0).map((f) => f.name);
    expect(open).toEqual([...PUBLIC]);
  });
});
