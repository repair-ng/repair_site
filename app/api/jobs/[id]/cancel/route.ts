import { canActForCustomer } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, notFound, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Cancelling a paid/live job costs the customer 1 point (cancelling an unpaid draft is free).
export const POST = userRoute<{ id: string }>({ limit: { name: "cancel", max: 30, windowMs: 3_600_000 } }, async ({ user, params }) => {
  const id = parseUuid(params.id);
  return tx(async (t) => {
    const j = await t.maybe<{ customer_id: string; worker_id: string | null; title: string; status: string }>(sql`
      SELECT customer_id, worker_id, title, status FROM jobs WHERE id = ${id} FOR UPDATE`);
    if (!j || !(await canActForCustomer(user.id, j.customer_id, t))) throw notFound();
    if (!["pending_payment", "open", "claimed", "engaged"].includes(j.status)) throw conflict("This job can no longer be cancelled.");
    await t.exec(sql`UPDATE jobs SET status = 'cancelled' WHERE id = ${id}`);
    if (j.status !== "pending_payment") await t.exec(sql`UPDATE users SET points = points - 1 WHERE id = ${j.customer_id}`);
    await t.exec(sql`INSERT INTO job_events (job_id, actor_id, type) VALUES (${id}, ${user.id}, 'cancelled')`);
    if (j.worker_id) await notify(t, { userId: j.worker_id, type: "job_cancelled", title: "Job cancelled", body: `The customer cancelled "${j.title}".`, data: { jobId: id } });
    return { ok: true };
  });
});
