import { createHash, timingSafeEqual } from "node:crypto";

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();

export function authenticateCronRequest(request: Request): Response | null {
  const current = process.env.CRON_SECRET;
  if (!current) return new Response("Server configuration error", { status: 500 });
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });
  const given = digest(token);
  const ok =
    timingSafeEqual(given, digest(current)) ||
    timingSafeEqual(given, digest(process.env.CRON_SECRET_PREVIOUS ?? current));
  return ok ? null : new Response("Unauthorized", { status: 401 });
}
