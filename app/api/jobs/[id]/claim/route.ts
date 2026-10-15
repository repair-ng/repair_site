import { getMembership } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, forbidden, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { ENGAGE_WINDOW_MINUTES, MAX_ACTIVE_CLAIMS } from "@/lib/rules";
import { object, optional, parse, parseUuid, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// First come, first served. The single UPDATE ... WHERE status='open' is atomic: if two workers click at the
// same instant, Postgres lets exactly one win and the other gets "already taken".
export const POST = userRoute<{ id: string }>({ role: "worker", limit: { name: "claim", max: 30, windowMs: 60_000 } }, async ({ req, user, params }) => {
  const id = parseUuid(params.id);
  const d = parse(object({ businessId: optional(uuid) }), await readJson(req, 512));
  return tx(async (t) => {
    let businessId: string | null = null;
    if (d.businessId) {
      const m = await getMembership(user.id, t);
      if (!m || m.businessId !== d.businessId) throw forbidden("You're not a member of that company.");
      if (!m.planActive) throw forbidden("That company's plan is not active.");
      businessId = m.businessId;
    }
    const active = await t.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM jobs WHERE worker_id = ${user.id} AND status IN ('claimed','engaged','in_progress')`);
    if (active.n >= MAX_ACTIVE_CLAIMS) throw conflict(`You can hold at most ${MAX_ACTIVE_CLAIMS} active jobs at once.`);

    const job = await t.maybe<{ id: string; customer_id: string; title: string; address: string }>(sql`
      UPDATE jobs SET status = 'claimed', worker_id = ${user.id}, business_id = ${businessId}, claimed_at = now(),
                      engage_deadline = now() + make_interval(mins => ${ENGAGE_WINDOW_MINUTES})
      WHERE id = ${id} AND status = 'open' AND visible_at <= now() AND customer_id <> ${user.id}
      RETURNING id, customer_id, title, address`);
    if (!job) throw conflict("Sorry — someone else got this job first, or it's no longer available.");

    await t.exec(sql`INSERT INTO job_events (job_id, actor_id, type) VALUES (${id}, ${user.id}, 'claimed')`);
    await notify(t, { userId: job.customer_id, type: "job_claimed", title: "A worker took your job", body: `${user.fullName} claimed "${job.title}" and has ${ENGAGE_WINDOW_MINUTES} minutes to get in touch.`, data: { jobId: id } });
    const c = await t.one<{ full_name: string; phone: string }>(sql`SELECT full_name, phone FROM users WHERE id = ${job.customer_id}`);
    return { ok: true, engageWithinMinutes: ENGAGE_WINDOW_MINUTES, customer: { name: c.full_name, phone: c.phone }, address: job.address };
  });
});
