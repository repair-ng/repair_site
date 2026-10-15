import { canActForCustomer } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, notFound, readJson, userRoute, badRequest } from "@/lib/http";
import { notify } from "@/lib/notify";
import { bool, object, optional, parse, parseUuid, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Customer accepts the worker — or declines with a reason (the worker sees it; the customer loses 1 point).
export const POST = userRoute<{ id: string }>({ limit: { name: "decision", max: 60, windowMs: 3_600_000 } }, async ({ req, user, params }) => {
  const id = parseUuid(params.id);
  const d = parse(object({ accept: bool, reason: optional(str({ min: 5, max: 300 })) }), await readJson(req, 2_048));
  if (!d.accept && !d.reason) throw badRequest("Please tell the worker why you're declining.");
  return tx(async (t) => {
    const j = await t.maybe<{ customer_id: string; worker_id: string; title: string; status: string }>(sql`
      SELECT customer_id, worker_id, title, status FROM jobs WHERE id = ${id} FOR UPDATE`);
    if (!j || !(await canActForCustomer(user.id, j.customer_id, t))) throw notFound();
    if (!["claimed", "engaged"].includes(j.status) || !j.worker_id) throw conflict("There's no worker waiting for your decision.");

    if (d.accept) {
      await t.exec(sql`UPDATE jobs SET status = 'in_progress' WHERE id = ${id}`);
      await t.exec(sql`INSERT INTO job_events (job_id, actor_id, type) VALUES (${id}, ${user.id}, 'accepted')`);
      await notify(t, { userId: j.worker_id, type: "worker_accepted", title: "You're hired", body: `The customer accepted you for "${j.title}".`, data: { jobId: id } });
      return { ok: true, status: "in_progress" };
    }
    await t.exec(sql`
      UPDATE jobs SET status = 'open', worker_id = NULL, business_id = NULL, claimed_at = NULL, engage_deadline = NULL, engaged_at = NULL WHERE id = ${id}`);
    await t.exec(sql`UPDATE users SET points = points - 1 WHERE id = ${j.customer_id}`);
    await t.exec(sql`INSERT INTO job_events (job_id, actor_id, type, detail) VALUES (${id}, ${user.id}, 'declined', ${d.reason!})`);
    await notify(t, { userId: j.worker_id, type: "worker_declined", title: "Customer declined", body: `For "${j.title}": ${d.reason}`, data: { jobId: id } });
    return { ok: true, status: "open" };
  });
});
