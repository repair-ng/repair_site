import { sql, tx } from "@/lib/db";
import { conflict, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// The worker confirms they've reached out within the 15-minute window; the customer is then prompted to accept.
export const POST = userRoute<{ id: string }>({ role: "worker" }, async ({ user, params }) => {
  const id = parseUuid(params.id);
  return tx(async (t) => {
    const j = await t.maybe<{ customer_id: string; title: string }>(sql`
      UPDATE jobs SET status = 'engaged', engaged_at = now()
      WHERE id = ${id} AND worker_id = ${user.id} AND status = 'claimed' AND engage_deadline > now()
      RETURNING customer_id, title`);
    if (!j) throw conflict("This claim has expired or isn't yours.");
    await t.exec(sql`INSERT INTO job_events (job_id, actor_id, type) VALUES (${id}, ${user.id}, 'engaged')`);
    await notify(t, { userId: j.customer_id, type: "accept_worker", title: "Accept your worker?", body: `${user.fullName} is ready for "${j.title}". Accept or decline them.`, data: { jobId: id } });
    return { ok: true };
  });
});
