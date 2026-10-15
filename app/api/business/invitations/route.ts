import { requireCompanyAdmin } from "@/lib/access";
import { db, sql, tx } from "@/lib/db";
import { conflict, forbidden, notFound, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { object, parse, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// A company picks a worker from the RE-PAIR workers tab and asks them to join.
export const POST = userRoute({ role: "worker", limit: { name: "invite", max: 60, windowMs: 3_600_000 } }, async ({ req, user }) => {
  const d = parse(object({ workerId: uuid }), await readJson(req, 512));
  return tx(async (t) => {
    const m = await requireCompanyAdmin(user, t);
    if (!m.planActive) throw forbidden("Your company plan must be active before you can add workers.");
    // Lock the business row so two admins can't both take the last free slot.
    const b = await t.one<{ declared_headcount: number }>(sql`SELECT declared_headcount FROM businesses WHERE id = ${m.businessId} FOR UPDATE`);
    const w = await t.maybe(sql`SELECT 1 FROM users WHERE id = ${d.workerId} AND role = 'worker' AND is_active`);
    if (!w) throw notFound("Worker not found.");
    if (await t.maybe(sql`SELECT 1 FROM company_members WHERE user_id = ${d.workerId}`)) throw conflict("That worker already belongs to a company.");
    const c = await t.one<{ used: number }>(sql`
      SELECT ((SELECT count(*) FROM company_members WHERE business_id = ${m.businessId}) +
              (SELECT count(*) FROM company_invitations WHERE business_id = ${m.businessId} AND status = 'pending'))::int AS used`);
    if (c.used >= b.declared_headcount) throw conflict(`You've declared ${b.declared_headcount} workers and they're all accounted for. Increase your headcount first.`);
    await t.exec(sql`INSERT INTO company_invitations (business_id, worker_id, invited_by) VALUES (${m.businessId}, ${d.workerId}, ${user.id})`);
    await notify(t, { userId: d.workerId, type: "company_invitation", title: "A company wants to register you", body: `${m.name} would like to list you as one of their workers. Accept or deny in your invitations.`, data: { businessId: m.businessId } });
    return { ok: true };
  });
});

export const GET = userRoute({ role: "worker" }, async ({ user }) => {
  const m = await requireCompanyAdmin(user);
  const rows = await db.rows<{ id: string; worker_id: string; full_name: string; status: string; created_at: Date }>(sql`
    SELECT i.id, i.worker_id, u.full_name, i.status, i.created_at
    FROM company_invitations i JOIN users u ON u.id = i.worker_id
    WHERE i.business_id = ${m.businessId} ORDER BY i.created_at DESC LIMIT 100`);
  return { invitations: rows.map((r) => ({ id: r.id, workerId: r.worker_id, workerName: r.full_name, status: r.status, createdAt: r.created_at })) };
});
