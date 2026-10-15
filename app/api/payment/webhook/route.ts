import { NextRequest, NextResponse } from "next/server";
import { PAYSTACK_IPS, verifyWebhookSignature } from "@/lib/paystack";
import { verifyAndSettle } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Paystack webhook. Security layers, in order:
//   1. (optional) source IP must be one of Paystack's documented IPs   [PAYSTACK_ENFORCE_IPS=true]
//   2. HMAC-SHA512 of the RAW body, keyed with PAYSTACK_SECRET_KEY, compared in constant time.
//      If the key isn't configured we reject EVERYTHING (fail closed).
//   3. We never trust the amount/status in the webhook body: we only take the `reference`,
//      then ask Paystack's API directly and check amount + currency against OUR payments row.
//   4. Settlement is idempotent (row lock + status check), so retries and replays do nothing.
// Respond 2xx only after the work succeeded, so Paystack retries real failures.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`webhook:${ip}`, 300, 60_000).ok) return NextResponse.json({ message: "Slow down." }, { status: 429 });
  if (process.env.PAYSTACK_ENFORCE_IPS === "true" && !PAYSTACK_IPS.includes(ip)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  const raw = await req.text(); // raw bytes as text — must NOT be re-serialised before hashing
  if (raw.length > 100_000) return NextResponse.json({ message: "Too large." }, { status: 413 });
  if (!verifyWebhookSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ message: "Invalid signature." }, { status: 401 });
  }

  let event: { event?: unknown; data?: { reference?: unknown } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ message: "Bad JSON." }, { status: 400 }); }

  if (event.event === "charge.success" && typeof event.data?.reference === "string" && /^[A-Za-z0-9_-]{5,64}$/.test(event.data.reference)) {
    try {
      await verifyAndSettle(event.data.reference);
    } catch (e) {
      console.error("[webhook] settle failed", (e as Error).message);
      return NextResponse.json({ message: "Try again." }, { status: 500 }); // Paystack will retry
    }
  }
  return NextResponse.json({ received: true });
}
