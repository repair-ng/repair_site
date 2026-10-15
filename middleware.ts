import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/origin";

// CSRF guard for every state-changing API call. The Paystack webhook and the cron endpoint are
// server-to-server (no browser, no cookies) and authenticate with a signature / secret instead.
const EXEMPT = ["/api/payment/webhook", "/api/cron/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (mutating && pathname.startsWith("/api/") && !EXEMPT.some((p) => pathname.startsWith(p))) {
    if (!isSameOrigin(req, process.env.APP_BASE_URL)) {
      return NextResponse.json({ message: "Cross-site request blocked." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
