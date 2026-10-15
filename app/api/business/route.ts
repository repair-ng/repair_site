import { getMembership } from "@/lib/access";
import { LOCATION_IDS } from "@/lib/config";
import { db, sql, tx } from "@/lib/db";
import { conflict, HttpError, readJson, userRoute } from "@/lib/http";
import { BUSINESS_MIN_AVG, BUSINESS_MIN_JOBS, BUSINESS_SKIP_FEE_KOBO, meetsBusinessRequirement, monthlyFeeKobo } from "@/lib/rules";
import { businessStats, workerStats } from "@/lib/stats";
import { int, object, oneOf, optional, parse, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// GET: the caller's company dashboard (any member can read basics).
export const GET = userRoute({ role: "worker" }, async ({ user }) => {
  const m = await getMembership(user.id);
  if (!m) {
    const s = await workerStats(user.id);
    return {
      business: null,
      eligibility: {
        completedJobs: s.completedJobs, lifetimeAverage: s.lifetimeAverage,
        meets: meetsBusinessRequirement(s.completedJobs, s.lifetimeAverage),
        requirement: `${BUSINESS_MIN_JOBS} completed jobs with an average of ${BUSINESS_MIN_AVG}+ stars`,
        skipFeeKobo: BUSINESS_SKIP_FEE_KOBO,
      },
    };
  }
  const b = await db.one<{ id: string; name: string; description: string | null; area_id: string; declared_headcount: number; monthly_fee_kobo: number; plan_paid_until: Date | null; status: string; members: number; pending: number }>(sql`
    SELECT b.id, b.name, b.description, b.area_id, b.declared_headcount, b.monthly_fee_kobo, b.plan_paid_until, b.status,
           (SELECT count(*)::int FROM company_members WHERE business_id = b.id) AS members,
           (SELECT count(*)::int FROM company_invitations WHERE business_id = b.id AND status = 'pending') AS pending
    FROM businesses b WHERE b.id = ${m.businessId}`);
  return {
    business: {
      id: b.id, name: b.name, description: b.description, areaId: b.area_id, declaredHeadcount: b.declared_headcount,
      monthlyFeeKobo: b.monthly_fee_kobo, planPaidUntil: b.plan_paid_until, status: b.status,
      members: b.members, pendingInvitations: b.pending, myRole: m.role, isOwner: m.isOwner,
      stats: await businessStats(b.id),
    },
  };
});

const schema = object({
  name: str({ min: 2, max: 120 }),
  description: optional(str({ max: 1000, multiline: true })),
  areaId: oneOf(LOCATION_IDS),
  headcount: int({ min: 1, max: 100_000 }),
});

// POST: register a business from profile settings. Requirement: 20 completed jobs @ 4.0+ OR pay the skip fee.
export const POST = userRoute({ role: "worker", limit: { name: "biz-register", max: 5, windowMs: 3_600_000 } }, async ({ req, user }) => {
  const d = parse(schema, await readJson(req, 8_192));
  return tx(async (t) => {
    if (await getMembership(user.id, t)) throw conflict("You already belong to a company.");
    const s = await workerStats(user.id, t);
    if (!meetsBusinessRequirement(s.completedJobs, s.lifetimeAverage)) {
      // Not eligible by track record: need an unused, paid skip fee (consumed atomically).
      const used = await t.maybe(sql`
        UPDATE payments SET consumed_at = now()
        WHERE id = (SELECT id FROM payments WHERE user_id = ${user.id} AND kind = 'business_skip_fee' AND status = 'paid' AND consumed_at IS NULL
                    ORDER BY paid_at LIMIT 1 FOR UPDATE)
        RETURNING id`);
      if (!used) throw new HttpError(402, "You need 20 completed jobs with a 4.0+ average rating, or pay the ₦20,200 fee to skip this requirement.");
    }
    const b = await t.one<{ id: string }>(sql`
      INSERT INTO businesses (owner_id, name, description, area_id, declared_headcount, monthly_fee_kobo)
      VALUES (${user.id}, ${d.name}, ${d.description ?? null}, ${d.areaId}, ${d.headcount}, ${monthlyFeeKobo(d.headcount)})
      RETURNING id`);
    await t.exec(sql`INSERT INTO company_members (user_id, business_id, role) VALUES (${user.id}, ${b.id}, 'admin')`);
    return { ok: true, businessId: b.id, monthlyFeeKobo: monthlyFeeKobo(d.headcount), nextStep: "Pay your first monthly plan to activate the company." };
  });
});
