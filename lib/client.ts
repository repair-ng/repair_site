"use client";
// Browser-side fetch helper. Never builds URLs from raw user text without encoding.
export class ApiError extends Error {
  constructor(public status: number, message: string, public issues?: { path: string; message: string }[]) { super(message); }
}
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.message || "Request failed.", data?.issues);
  return data as T;
}
export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;
export const qs = (o: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
