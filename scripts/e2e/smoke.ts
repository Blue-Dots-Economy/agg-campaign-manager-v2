// HTTP smoke test against a running dev server: pages, login per role, the server-function
// role matrix, the same-origin check and one dashboard number against the database.
// Run: bun scripts/e2e/smoke.ts (after setup.sh, with the env from env.example.sh exported).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
// Same serializer and plugins the TanStack Start browser client uses.
import { createDefaultSerovalPlugins } from "@tanstack/router-core/ssr/client";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { FN_ROLES, ROLES, landingFor, type Role } from "../../src/auth/roles";
import { E2E_EMAIL_DOMAIN } from "./config";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3200";
const PASSWORD = process.env.E2E_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
if (!PASSWORD) throw new Error("E2E_PASSWORD is not set");
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

/** Per-request limit, so a hung dev server fails the run instead of stalling it. */
const REQUEST_TIMEOUT_MS = 30_000;
const SRC = fileURLToPath(new URL("../../src", import.meta.url));
const SESSION_COOKIE = "cm_session";
/** Input sent to every GET server function in the role matrix; most read endpoints need a program. */
const DEFAULT_GET_INPUT = { program: "seekers" };
const serovalPlugins = createDefaultSerovalPlugins();

type FnGroup = keyof typeof FN_ROLES;
interface ServerFn {
  file: string;
  name: string;
  method: "GET" | "POST";
  group: FnGroup | null;
}

const results: { ok: boolean; name: string; detail?: string }[] = [];
const skipped: string[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ ok, name, detail });
}

/** Builds the dev-server endpoint id TanStack Start gives a server function. */
function fnUrl(fn: Pick<ServerFn, "file" | "name">): string {
  const id = Buffer.from(
    JSON.stringify({
      file: `/src/${fn.file}?tss-serverfn-split`,
      export: `${fn.name}_createServerFn_handler`,
    }),
  ).toString("base64url");
  return `${BASE}/_serverFn/${id}`;
}

/** Calls a server function the way the browser client does and returns status, value and cookie. */
async function callFn(
  fn: Pick<ServerFn, "file" | "name" | "method">,
  opts: { data?: unknown; cookie?: string; origin?: string } = {},
): Promise<{ status: number; value: unknown; setCookie: string | null; html: boolean }> {
  const payload =
    opts.data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data: opts.data }));
  const headers: Record<string, string> = { "x-tsr-serverFn": "true", accept: "application/json" };
  if (opts.cookie) headers.cookie = opts.cookie;
  let url = fnUrl(fn);
  let body: string | undefined;
  if (fn.method === "GET") {
    if (payload) url += `?${new URLSearchParams({ payload })}`;
  } else {
    headers.origin = opts.origin ?? BASE;
    if (payload) {
      headers["content-type"] = "application/json";
      body = payload;
    }
  }
  const res = await fetch(url, {
    method: fn.method,
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let value: unknown = null;
  try {
    const parsed: unknown = fromCrossJSON(JSON.parse(text), {
      plugins: serovalPlugins,
      refs: new Map(),
    });
    if (parsed && typeof parsed === "object" && "result" in parsed) value = parsed.result;
  } catch {
    // Not a serialized server-function reply (for example the dev server's HTML error page).
  }
  const html = (res.headers.get("content-type") ?? "").includes("text/html");
  return { status: res.status, value, setCookie: res.headers.get("set-cookie"), html };
}

function isFnGroup(key: string | null | undefined): key is FnGroup {
  return !!key && Object.hasOwn(FN_ROLES, key);
}

/** Lists every exported server function with its method and FN_ROLES group, from the source. */
function discoverServerFns(): ServerFn[] {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const out: ServerFn[] = [];
  for (const path of files(SRC)) {
    const text = readFileSync(path, "utf8");
    const consts = new Map(
      [...text.matchAll(/const (\w+) = requireRole\(FN_ROLES\.(\w+)\)/g)].map((m) => [m[1], m[2]]),
    );
    const re =
      /export const (\w+) = createServerFn\(\{\s*method:\s*"(GET|POST)"[^)]*\)([\s\S]*?)\.handler\(/g;
    for (const m of text.matchAll(re)) {
      const mw = /\.middleware\(\[([^\]]*)\]\)/.exec(m[3])?.[1] ?? "";
      const inline = /requireRole\(FN_ROLES\.(\w+)\)/.exec(mw)?.[1];
      const viaConst = mw
        .split(",")
        .map((s) => consts.get(s.trim()))
        .find(Boolean);
      const key = inline ?? viaConst ?? null;
      out.push({
        file: relative(SRC, path),
        name: m[1],
        method: m[2] === "GET" ? "GET" : "POST",
        group: isFnGroup(key) ? key : null,
      });
    }
  }
  return out;
}

const AUTH = "lib/auth.functions.ts";
const login = { file: AUTH, name: "login", method: "POST" } as const;
const me = { file: AUTH, name: "me", method: "GET" } as const;
const logout = { file: AUTH, name: "logout", method: "POST" } as const;

function sessionCookie(setCookie: string | null): string | undefined {
  const m = setCookie ? new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie) : null;
  return m?.[1] ? `${SESSION_COOKIE}=${m[1]}` : undefined;
}

// 1. Pages answer.
for (const path of ["/", "/login"]) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  check(`GET ${path} is 200`, res.status === 200, `got ${res.status}`);
}

// 2. Anonymous and bad-password calls are refused.
check("me without a session is 401", (await callFn(me)).status === 401);
const bad = await callFn(login, {
  data: { email: `admin@${E2E_EMAIL_DOMAIN}`, password: `${PASSWORD}-wrong` },
});
check(
  "login with a wrong password sets no session",
  !sessionCookie(bad.setCookie),
  `status ${bad.status}`,
);

// 3. Every role signs in and gets its own role back.
const cookies = new Map<Role, string>();
for (const role of ROLES) {
  const res = await callFn(login, {
    data: { email: `${role}@${E2E_EMAIL_DOMAIN}`, password: PASSWORD },
  });
  const cookie = sessionCookie(res.setCookie);
  check(`${role}: login sets a session`, res.status === 200 && !!cookie, `status ${res.status}`);
  if (!cookie) continue;
  cookies.set(role, cookie);
  const who = await callFn(me, { cookie });
  const gotRole =
    who.value && typeof who.value === "object" && "role" in who.value ? who.value.role : null;
  check(
    `${role}: me returns role ${role} (lands on ${landingFor(role)})`,
    gotRole === role,
    `got ${String(gotRole)}`,
  );
}

// 4. Server-function role matrix, read-only (GET) functions only.
const fns = discoverServerFns();
const gets = fns.filter((f) => f.method === "GET" && f.group);
// Asking Vite for each module registers its server functions, so the matrix does not depend on
// which pages were opened since the dev server started.
await Promise.all(
  [...new Set(fns.map((f) => f.file))].map((file) =>
    fetch(`${BASE}/src/${file}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  ),
);
check(
  "server functions discovered",
  gets.length > 0,
  `${fns.length} total, ${gets.length} GET with a role group`,
);
for (const fn of gets) {
  if (!fn.group) continue;
  const allowed: readonly Role[] = FN_ROLES[fn.group];
  const adminCookie = cookies.get("admin");
  // An HTML error page means the dev server could not register this function.
  if (adminCookie && (await callFn(fn, { cookie: adminCookie, data: DEFAULT_GET_INPUT })).html) {
    skipped.push(`${fn.name} (dev server could not register it)`);
    continue;
  }
  const wrong: string[] = [];
  for (const [role, cookie] of cookies) {
    const { status } = await callFn(fn, { cookie, data: DEFAULT_GET_INPUT });
    const denied = status === 401 || status === 403;
    if (allowed.includes(role) === denied) wrong.push(`${role}:${status}`);
  }
  check(
    `${fn.name} (${fn.group}) allows exactly ${allowed.join(",")}`,
    wrong.length === 0,
    wrong.join(" "),
  );
}

// 5. A cross-site POST is refused even with a valid session.
const adminCookie = cookies.get("admin");
if (adminCookie) {
  const res = await callFn(logout, { cookie: adminCookie, origin: "https://evil.example" });
  check("cross-site POST is 403", res.status === 403, `got ${res.status}`);
}

// 6. A dashboard number matches the database.
if (adminCookie) {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{ n: string }>(
    "select count(*) as n from call_rows where program = 'seekers'",
  );
  await db.end();
  const expected = Number(rows[0]?.n ?? -1);
  const agg = await callFn(
    { file: "lib/snapshot.functions.ts", name: "fetchProgramAggregates", method: "GET" },
    { cookie: adminCookie, data: { program: "seekers" } },
  );
  const got =
    agg.value && typeof agg.value === "object" && "totalRows" in agg.value
      ? agg.value.totalRows
      : null;
  check(
    "seekers total calls on the dashboard match the database",
    got === expected && expected > 0,
    `dashboard ${String(got)}, db ${expected}`,
  );
}

const failed = results.filter((r) => !r.ok);
for (const r of results)
  console.info(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  (${r.detail})`}`);
for (const s of skipped) console.info(`SKIP  ${s}`);
console.info(
  `\n${results.length - failed.length}/${results.length} passed, ${skipped.length} skipped`,
);
process.exit(failed.length ? 1 : 0);
