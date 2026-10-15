// Edge-safe (no Node imports): used by middleware.ts.
// CSRF defence for cookie-authenticated APIs: state-changing requests must
// come from our own origin. (Session cookies are also SameSite=Lax.)
export function isSameOrigin(req: Request, appBaseUrl: string | undefined): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    if (appBaseUrl) {
      try { return origin === new URL(appBaseUrl).origin; } catch { /* fall through */ }
    }
    const host = req.headers.get("host");
    try { return host !== null && new URL(origin).host === host; } catch { return false; }
  }
  // No Origin header: only allow browsers that say the request is same-origin.
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}
