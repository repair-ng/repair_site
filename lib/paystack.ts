import crypto from "node:crypto";
import { safeEqual } from "./security";

const API = "https://api.paystack.co";

export const paystackConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY);

/** x-paystack-signature = HMAC-SHA512(rawBody, secretKey), hex. Compared in constant time. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false; // fail CLOSED: no key configured => reject everything
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

// Paystack's documented webhook source IPs (optional extra layer; signature is the real control).
export const PAYSTACK_IPS = ["52.31.139.75", "52.49.173.169", "52.214.14.220"];

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: any } | null;
  if (!json) throw new Error("Paystack returned an unreadable response");
  return json;
}

export async function initializeTransaction(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, string> }) {
  const json = await call("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ email: p.email, amount: String(p.amountKobo), reference: p.reference, currency: "NGN", callback_url: p.callbackUrl, metadata: p.metadata }),
  });
  if (!json.status || !json.data?.authorization_url) throw new Error(`Paystack init failed: ${json.message}`);
  return json.data.authorization_url as string;
}

/** Server-to-server confirmation — we never grant value from the webhook body alone. */
export async function verifyTransaction(reference: string): Promise<{ success: boolean; amountKobo: number; currency: string }> {
  const json = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!json.status || !json.data) return { success: false, amountKobo: 0, currency: "" };
  return { success: json.data.status === "success", amountKobo: Number(json.data.amount), currency: String(json.data.currency) };
}
