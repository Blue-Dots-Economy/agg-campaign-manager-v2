// Local stand-in for Raya and Google Sheets, so the app runs end to end without real keys.
//   bun scripts/e2e/mock-upstreams.ts                          serve on E2E_MOCK_PORT (default 4010)
//   bun scripts/e2e/mock-upstreams.ts service-account <path>   write a fake service account JSON
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createMockRaya, MOCK_AGENTS } from "./mock-raya";
import {
  createMockSheets,
  MOCK_ACCESS_TOKEN,
  MOCK_CALL_LOG_SHEET_ID,
  MOCK_PROVIDER_CALLS_TAB,
  MOCK_SEEKER_CALLS_TAB,
  MOCK_STAGING_SHEET_ID,
  MOCK_STAGING_TAB,
} from "./mock-sheets";

export {
  MOCK_ACCESS_TOKEN,
  MOCK_AGENTS,
  MOCK_CALL_LOG_SHEET_ID,
  MOCK_PROVIDER_CALLS_TAB,
  MOCK_SEEKER_CALLS_TAB,
  MOCK_STAGING_SHEET_ID,
  MOCK_STAGING_TAB,
};

/** Port used when `E2E_MOCK_PORT` is not set. */
export const DEFAULT_MOCK_PORT = 4010;
/** Path prefix of the Raya routes (`RAYA_BASE_URL` ends with it). */
const RAYA_PREFIX = "/raya";
/** Path prefix of the Sheets routes (`SHEETS_API_BASE_URL` ends with it). */
const SHEETS_PREFIX = "/sheets/v4/spreadsheets/";
/** Path of the OAuth token endpoint (`token_uri` in the service account). */
const TOKEN_PATH = "/oauth/token";
/** RSA key size for the fake service account; jose's RS256 needs at least 2048 bits. */
const RSA_BITS = 2048;

/**
 * Builds the mock's request handler with fresh in-memory state.
 *
 * @param now - Clock for created and call times.
 */
export function createMockUpstreams(now: () => Date = () => new Date()) {
  const raya = createMockRaya(now);
  const sheets = createMockSheets();

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === RAYA_PREFIX || path.startsWith(`${RAYA_PREFIX}/`)) {
      return raya.handle(req, path.slice(RAYA_PREFIX.length), url.searchParams);
    }
    if (path === TOKEN_PATH && req.method === "POST") return sheets.token();
    if (path.startsWith(SHEETS_PREFIX)) {
      return sheets.handle(req, path.slice(SHEETS_PREFIX.length), url.searchParams);
    }
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  return { handle };
}

/**
 * Returns a service account JSON with a new RSA key, accepted by the app's token code.
 *
 * @param tokenUri - Token endpoint the app posts its signed assertion to.
 */
export function serviceAccountJson(tokenUri: string): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: RSA_BITS });
  return JSON.stringify({
    type: "service_account",
    client_email: "mock-sheets@mock-project.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: tokenUri,
  });
}

function port(): number {
  const raw = process.env.E2E_MOCK_PORT;
  const n = raw ? Number(raw) : DEFAULT_MOCK_PORT;
  if (!Number.isInteger(n) || n <= 0) throw new Error("E2E_MOCK_PORT must be a port number");
  return n;
}

if (import.meta.main) {
  const [command, target] = process.argv.slice(2);
  const origin = `http://127.0.0.1:${port()}`;
  if (command === "service-account") {
    if (!target) throw new Error("Usage: mock-upstreams.ts service-account <path>");
    writeFileSync(target, serviceAccountJson(`${origin}${TOKEN_PATH}`), { mode: 0o600 });
    console.info(`Wrote ${target}`);
  } else {
    const mock = createMockUpstreams();
    Bun.serve({ port: port(), hostname: "127.0.0.1", fetch: (req) => mock.handle(req) });
    console.info(
      [
        `Mock upstreams on ${origin}`,
        `  RAYA_BASE_URL=${origin}${RAYA_PREFIX}`,
        `  SHEETS_API_BASE_URL=${origin}${SHEETS_PREFIX}`,
        `  token_uri=${origin}${TOKEN_PATH}`,
        `Agents: ${MOCK_AGENTS.map((a) => `${a.id} (${a.name})`).join(", ")}`,
        `Call-log sheet: ${MOCK_CALL_LOG_SHEET_ID} (tabs "${MOCK_SEEKER_CALLS_TAB}", "${MOCK_PROVIDER_CALLS_TAB}")`,
        `Staging sheet: ${MOCK_STAGING_SHEET_ID} (tab "${MOCK_STAGING_TAB}")`,
      ].join("\n"),
    );
  }
}
