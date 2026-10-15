import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db, sql } from "./db";
import { randomToken, sha256Hex } from "./security";

// --- Password hashing (scrypt, built into Node — no native dependency) --------
const scrypt = promisify(crypto.scrypt) as (pw: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const OPTS: crypto.ScryptOptions = { N, r: R, p: P, maxmem: 128 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, OPTS);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Used so "unknown email" costs the same time as "wrong password".
let dummyHash: Promise<string> | null = null;
export function dummyVerify(password: string): Promise<boolean> {
  dummyHash ??= hashPassword("dummy-password-for-timing-1");
  return dummyHash.then((h) => verifyPassword(password, h));
}

// --- Sessions -----------------------------------------------------------------
export const SESSION_COOKIE = "rp_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  role: "worker" | "customer";
  customerKind: "individual" | "company" | null;
  fullName: string;
  companyName: string | null;
  areaId: string;
  lat: number | null;
  lng: number | null;
  points: number;
};

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  await db.exec(sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${sha256Hex(token)}, now() + interval '14 days')`);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,                                   // not readable by JavaScript (blunts XSS token theft)
    secure: process.env.NODE_ENV === "production",    // HTTPS only in production
    sameSite: "lax",                                  // not sent on cross-site POSTs (CSRF)
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await db.exec(sql`DELETE FROM sessions WHERE token_hash = ${sha256Hex(token)}`);
  cookies().delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await db.maybe<{
    id: string; role: "worker" | "customer"; customer_kind: "individual" | "company" | null; full_name: string;
    company_name: string | null; area_id: string; lat: number | null; lng: number | null; points: number;
  }>(sql`
    SELECT u.id, u.role, u.customer_kind, u.full_name, u.company_name, u.area_id, u.lat, u.lng, u.points
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256Hex(token)} AND s.expires_at > now() AND u.is_active`);
  if (!row) return null;
  return {
    id: row.id, role: row.role, customerKind: row.customer_kind, fullName: row.full_name,
    companyName: row.company_name, areaId: row.area_id, lat: row.lat, lng: row.lng, points: row.points,
  };
}
