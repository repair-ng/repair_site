import { canActForCustomer } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, notFound, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Customer confirms the work is done: +1 customer point, +1 completed job for the worker (and their company).
export const POST = userRoute<{ id: string }>({}, async ({ user, params }) => {
  const id = parseUuid(params.id);
  return tx(async (t) => {
    const j = await t.maybe<{ customer_id: string; worker_id: string | null; title: string }>(sql`
      UPDATE jobs SET status = 'completed', completed_at = now()
      WHERE id = ${id} AND status = 'in_progress'
        AND (customer_id = ${user.id} OR customer_id IN (SELECT company_id FROM customer_company_admins WHERE admin_user_id = ${user.id}))
      RETURNING customer_id, worker_id, title`);
    if (!j) {
      const exists = await t.maybe<{ customer_id: string }>(sql`SELECT customer_id FROM jobs WHERE id = ${id}`);
      if (!exists || !(await canActForCustomer(user.id, exists.customer_id, t))) throw notFound();
      throw conflict("Only a job that's in progress can be completed.");
    }
    await t.exec(sql`UPDATE users SET points = points + 1 WHERE id = ${j.customer_id}`);
    await t.exec(sql`INSERT INTO job_events (job_id, actor_id, type) VALUES (${id}, ${user.id}, 'completed')`);
    if (j.worker_id) await notify(t, { userId: j.worker_id, type: "job_completed", title: "Job marked complete", body: `"${j.title}" was completed. A rating may follow.`, data: { jobId: id } });
    return { ok: true };
  });
});
