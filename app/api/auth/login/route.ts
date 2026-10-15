import { createSession, dummyVerify, verifyPassword } from "@/lib/auth";
import { db, sql } from "@/lib/db";
import { HttpError, publicRoute, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/security";
import { email, object, parse, Rule } from "@/lib/validate";

export const dynamic = "force-dynamic";

const loginPassword: Rule<string> = (v, path, issues) => {
  if (typeof v !== "string" || v.length < 1 || v.length > 128) { issues.push({ path, message: "Enter your password." }); return undefined; }
  return v;
};
const schema = object({ email, password: loginPassword });
const GENERIC = "Incorrect email or password.";

export const POST = publicRoute({ limit: { name: "login", max: 20, windowMs: 60_000 } }, async ({ req }) => {
  const d = parse(schema, await readJson(req, 4_096));
  // Per-account throttle (stops one attacker rotating IPs against one victim).
  if (!rateLimit(`login-acct:${d.email}`, 10, 15 * 60_000).ok) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");

  const u = await db.maybe<{ id: string; password_hash: string; locked: boolean }>(sql`
    SELECT id, password_hash, (locked_until IS NOT NULL AND locked_until > now()) AS locked
    FROM users WHERE lower(email) = ${d.email} AND is_active`);
  if (!u) { await dummyVerify(d.password); throw new HttpError(401, GENERIC); } // same timing as a real check
  if (u.locked) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");

  if (!(await verifyPassword(d.password, u.password_hash))) {
    await db.exec(sql`
      UPDATE users SET failed_logins = failed_logins + 1,
        locked_until = CASE WHEN failed_logins + 1 >= 8 THEN now() + interval '15 minutes' ELSE locked_until END
      WHERE id = ${u.id}`);
    throw new HttpError(401, GENERIC);
  }
  await db.exec(sql`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ${u.id}`);
  await createSession(u.id);
  return { ok: true };
});
