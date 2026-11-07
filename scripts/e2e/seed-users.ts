// Creates or resets one active user per role (<role>@e2e.local) with the password in E2E_PASSWORD.
import pg from "pg";
import { ROLES } from "../../src/auth/roles";
import { hashPassword, passwordProblem } from "../../src/server/auth/password.server";
import { E2E_EMAIL_DOMAIN } from "./config";

const url = process.env.DATABASE_URL;
const password = process.env.E2E_PASSWORD;
if (!url) throw new Error("DATABASE_URL is not set");
if (!password) throw new Error("E2E_PASSWORD is not set");
const problem = passwordProblem(password);
if (problem) throw new Error(`E2E_PASSWORD is not accepted by the app: ${problem}`);

const hash = await hashPassword(password);
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const role of ROLES) {
    await client.query(
      `INSERT INTO app_users (email, name, role, password_hash, must_change_password, active)
       VALUES ($1, $2, $3, $4, false, true)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash, must_change_password = false, active = true,
         failed_login_count = 0, locked_until = NULL`,
      [`${role}@${E2E_EMAIL_DOMAIN}`, `E2E ${role}`, role, hash],
    );
  }
} finally {
  await client.end();
}
console.info(
  `Seeded ${ROLES.length} users: ${ROLES.map((r) => `${r}@${E2E_EMAIL_DOMAIN}`).join(", ")}`,
);
