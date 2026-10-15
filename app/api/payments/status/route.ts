import { db, sql } from "@/lib/db";
import { notFound, queryObject, userRoute } from "@/lib/http";
import { verifyAndSettle } from "@/lib/payments";
import { object, parse, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Called by /payment/callback after Paystack redirects the customer back. It re-verifies with Paystack,
// so the page never trusts the redirect itself ("arrived at callback" != "paid").
export const GET = userRoute({ limit: { name: "pay-status", max: 60, windowMs: 60_000 } }, async ({ req, user }) => {
  const { reference } = parse(object({ reference: str({ min: 5, max: 64, pattern: /^[A-Za-z0-9_-]+$/ }) }), queryObject(req));
  const p = await db.maybe<{ kind: string; subject_id: string | null }>(sql`SELECT kind, subject_id FROM payments WHERE reference = ${reference} AND user_id = ${user.id}`);
  if (!p) throw notFound();
  const status = await verifyAndSettle(reference);
  return { status, kind: p.kind, subjectId: p.subject_id };
});
