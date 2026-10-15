import { getMembership } from "@/lib/access";
import { db, sql } from "@/lib/db";
import { conflict, forbidden, readJson, userRoute } from "@/lib/http";
import { startPayment } from "@/lib/payments";
import { BUSINESS_SKIP_FEE_KOBO, meetsBusinessRequirement } from "@/lib/rules";
import { workerStats } from "@/lib/stats";
import { object, oneOf, parse } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Company-related payments. Job fees are started from /api/jobs. The AMOUNT is always computed here.
export const POST = userRoute({ role: "worker", limit: { name: "pay-init", max: 20, windowMs: 3_600_000 } }, async ({ req, user }) => {
  const d = parse(object({ kind: oneOf(["business_skip_fee", "business_plan"] as const) }), await readJson(req, 512));

  if (d.kind === "business_skip_fee") {
    const s = await workerStats(user.id);
    if (meetsBusinessRequirement(s.completedJobs, s.lifetimeAverage)) throw conflict("You already qualify — no fee needed.");
    if (await getMembership(user.id)) throw conflict("You already belong to a company.");
    const unused = await db.maybe(sql`SELECT 1 FROM payments WHERE user_id = ${user.id} AND kind = 'business_skip_fee' AND status = 'paid' AND consumed_at IS NULL`);
    if (unused) throw conflict("You've already paid — go ahead and register your business.");
    return { ok: true, ...(await startPayment({ userId: user.id, kind: "business_skip_fee", amountKobo: BUSINESS_SKIP_FEE_KOBO, subjectId: null })) };
  }

  const m = await getMembership(user.id);
  if (!m || !m.isOwner) throw forbidden("Only the company owner can pay the plan.");
  const b = await db.one<{ monthly_fee_kobo: number }>(sql`SELECT monthly_fee_kobo FROM businesses WHERE id = ${m.businessId}`);
  return { ok: true, ...(await startPayment({ userId: user.id, kind: "business_plan", amountKobo: b.monthly_fee_kobo, subjectId: m.businessId })) };
});
