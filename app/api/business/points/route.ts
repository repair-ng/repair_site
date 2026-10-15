import { requireCompanyAdmin } from "@/lib/access";
import { db, sql, tx } from "@/lib/db";
import { conflict, notFound, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { int, object, parse, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Balance of points that haven't expired yet (points vanish 7 days after they're earned).
export const GET = userRoute({ role: "worker" }, async ({ user }) => {
  const m = await requireCompanyAdmin(user);
  const r = await db.one<{ balance: number; next_expiry: Date | null }>(sql`
    SELECT coalesce(sum(remaining), 0)::int AS balance, min(expires_at) AS next_expiry
    FROM point_grants WHERE business_id = ${m.businessId} AND remaining > 0 AND expires_at > now()`);
  return { balance: r.balance, nextExpiry: r.next_expiry };
});

// Admin designates points to a worker who did an outstanding job (oldest-expiring points are spent first).
export const POST = userRoute({ role: "worker", limit: { name: "award", max: 60, windowMs: 3_600_000 } }, async ({ req, user }) => {
  const d = parse(object({ workerId: uuid, points: int({ min: 1, max: 100_000 }) }), await readJson(req, 512));
  return tx(async (t) => {
    const m = await requireCompanyAdmin(user, t);
    const member = await t.maybe(sql`SELECT 1 FROM company_members WHERE user_id = ${d.workerId} AND business_id = ${m.businessId}`);
    if (!member) throw notFound("That worker isn't in your company.");
    const grants = await t.rows<{ id: string; remaining: number }>(sql`
      SELECT id, remaining FROM point_grants
      WHERE business_id = ${m.businessId} AND remaining > 0 AND expires_at > now()
      ORDER BY expires_at FOR UPDATE`);
    const available = grants.reduce((a, g) => a + g.remaining, 0);
    if (available < d.points) throw conflict(`Only ${available} unexpired points are available.`);
    let need = d.points;
    for (const g of grants) {
      if (need === 0) break;
      const take = Math.min(g.remaining, need);
      await t.exec(sql`UPDATE point_grants SET remaining = remaining - ${take} WHERE id = ${g.id}`);
      need -= take;
    }
    await t.exec(sql`INSERT INTO point_awards (business_id, worker_id, awarded_by, amount) VALUES (${m.businessId}, ${d.workerId}, ${user.id}, ${d.points})`);
    await notify(t, { userId: d.workerId, type: "points_awarded", title: `You earned ${d.points} points`, body: `${m.name} recognised your work. Points improve your displayed rating.` });
    return { ok: true, remaining: available - d.points };
  });
});
