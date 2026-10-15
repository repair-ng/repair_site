import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, SessionUser } from "./auth";
import { clientIp, rateLimit } from "./security";
import { ValidationError } from "./validate";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const forbidden = (m = "You don't have permission to do that.") => new HttpError(403, m);
export const notFound = (m = "Not found.") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

/** Reads a JSON body with a hard size cap (streamed, so a chunked upload can't exhaust memory). */
export async function readJson(req: Request, maxBytes = 32_768): Promise<unknown> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) throw new HttpError(415, "Content-Type must be application/json.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "Request too large.");
  const reader = req.body?.getReader();
  if (!reader) throw badRequest("Missing request body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new HttpError(413, "Request too large."); }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("Invalid JSON.");
  }
}

type Limit = { name: string; max: number; windowMs: number };
type Base = { req: NextRequest; ip: string };
type Params = Record<string, string>;

async function run(
  req: NextRequest, params: Params | undefined, limit: Limit | undefined,
  inner: (ip: string) => Promise<unknown>
): Promise<Response> {
  try {
    const ip = clientIp(req.headers);
    // Every route gets a generous per-IP ceiling; sensitive ones pass a tighter `limit`.
    const l = limit ?? { name: "default", max: 120, windowMs: 60_000 };
    const rl = rateLimit(`${l.name}:${ip}`, l.max, l.windowMs);
    if (!rl.ok) {
      return NextResponse.json({ message: "Too many requests. Please slow down." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
    }
    const out = await inner(ip);
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ValidationError) {
    return NextResponse.json({ message: "Please check the form and try again.", issues: err.issues }, { status: 400 });
  }
  if (err instanceof HttpError) return NextResponse.json({ message: err.message }, { status: err.status });
  const e = err as { code?: string; constraint?: string; routine?: string };
  // Postgres error codes: never leak SQL text, table names or values to the client.
  if (e?.code === "23505") return NextResponse.json({ message: "That already exists." }, { status: 409 });
  if (e?.code === "23503" || e?.code === "23514" || e?.code === "22P02" || e?.code === "22001") {
    return NextResponse.json({ message: "That request isn't valid." }, { status: 400 });
  }
  console.error("[api error]", { code: e?.code, constraint: e?.constraint, routine: e?.routine, message: (err as Error)?.message });
  return NextResponse.json({ message: "Something went wrong on our side. Please try again." }, { status: 500 });
}

/** Route that anyone may call (signup, login, webhooks...). */
export function publicRoute<P extends Params = Params>(
  opts: { limit?: Limit },
  handler: (c: Base & { params: P }) => Promise<unknown>
) {
  return (req: NextRequest, ctx: { params: P }) =>
    run(req, ctx?.params, opts.limit, (ip) => handler({ req, ip, params: ctx?.params }));
}

/** Route that needs a logged-in user (optionally with a specific role). */
export function userRoute<P extends Params = Params>(
  opts: { role?: "worker" | "customer"; limit?: Limit },
  handler: (c: Base & { params: P; user: SessionUser }) => Promise<unknown>
) {
  return (req: NextRequest, ctx: { params: P }) =>
    run(req, ctx?.params, opts.limit, async (ip) => {
      const user = await getSessionUser();
      if (!user) throw new HttpError(401, "Please log in.");
      if (opts.role && user.role !== opts.role) throw forbidden(opts.role === "worker" ? "This is for worker accounts." : "This is for customer accounts.");
      return handler({ req, ip, params: ctx?.params, user });
    });
}

/** Query-string -> plain object (last value wins). Unknown keys are rejected by the schema. */
export function queryObject(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}
