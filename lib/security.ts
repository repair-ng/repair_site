import crypto from "node:crypto";

/** Escape %, _ and \ so user text is matched literally inside ILIKE patterns. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Constant-time string comparison (hashes first so lengths don't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const sha256Hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

// --- Rate limiting -----------------------------------------------------------
// In-memory fixed window. Correct for the single-container VPS deployment this
// app targets; if you ever scale to >1 replica, move this to Redis/Postgres.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 20_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

/**
 * Client IP behind ONE trusted reverse proxy (Dokploy's Traefik). Traefik
 * appends the real peer address as the LAST x-forwarded-for entry; earlier
 * entries are client-supplied and must not be trusted.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}
