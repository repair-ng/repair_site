import { canActForCustomer } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, notFound, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { POINTS_TTL_DAYS, pointsForRating } from "@/lib/rules";
import { int, object, optional, parse, parseUuid, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Only the registered customer (or a designated admin of a customer company) can rate — and only once per completed job.
export const POST = userRoute<{ id: string }>({ limit: { name: "rate", max: 30, windowMs: 3_600_000 } }, async ({ req, user, params }) => {
  const id = parseUuid(params.id);
  const d = parse(object({ stars: int({ min: 1, max: 5 }), comment: optional(str({ max: 1000, multiline: true })) }), await readJson(req, 4_096));
  return tx(async (t) => {
    const j = await t.maybe<{ customer_id: string; worker_id: string | null; business_id: string | null; status: string; title: string }>(sql`
      SELECT customer_id, worker_id, business_id, status, title FROM jobs WHERE id = ${id} FOR UPDATE`);
    if (!j || !(await canActForCustomer(user.id, j.customer_id, t))) throw notFound();
    if (j.status !== "completed" || !j.worker_id) throw conflict("You can rate a job once it's completed.");
    const inserted = await t.maybe(sql`
      INSERT INTO ratings (job_id, rater_id, worker_id, business_id, stars, comment)
      VALUES (${id}, ${user.id}, ${j.worker_id}, ${j.business_id}, ${d.stars}, ${d.comment ?? null})
      ON CONFLICT (job_id) DO NOTHING RETURNING id`);
    if (!inserted) throw conflict("This job has already been rated.");

    // Company took the job => it earns points from (rating x headcount). They expire after 7 days.
    if (j.business_id) {
      const n = await t.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM company_members WHERE business_id = ${j.business_id}`);
      const pts = pointsForRating(d.stars, n.n);
      await t.exec(sql`
        INSERT INTO point_grants (business_id, job_id, amount, remaining, expires_at)
        VALUES (${j.business_id}, ${id}, ${pts}, ${pts}, now() + make_interval(days => ${POINTS_TTL_DAYS}))
        ON CONFLICT (job_id) DO NOTHING`);
    }
    await notify(t, { userId: j.worker_id, type: "rated", title: `You got ${d.stars} star${d.stars === 1 ? "" : "s"}`, body: `New rating for "${j.title}".`, data: { jobId: id } });
    return { ok: true };
  });
});
