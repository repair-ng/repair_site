import { sql, tx } from "@/lib/db";
import { conflict, notFound, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { bool, object, parse, parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = userRoute<{ id: string }>({ role: "worker" }, async ({ req, user, params }) => {
  const id = parseUuid(params.id);
  const d = parse(object({ accept: bool }), await readJson(req, 512));
  return tx(async (t) => {
    const inv = await t.maybe<{ business_id: string; invited_by: string; name: string }>(sql`
      SELECT i.business_id, i.invited_by, b.name FROM company_invitations i JOIN businesses b ON b.id = i.business_id
      WHERE i.id = ${id} AND i.worker_id = ${user.id} AND i.status = 'pending' FOR UPDATE OF i`);
    if (!inv) throw notFound("Invitation not found.");

    if (!d.accept) {
      await t.exec(sql`UPDATE company_invitations SET status = 'denied', responded_at = now() WHERE id = ${id}`);
      await notify(t, { userId: inv.invited_by, type: "invitation_denied", title: "Invitation declined", body: `${user.fullName} declined to join ${inv.name}.` });
      return { ok: true, accepted: false };
    }
    const b = await t.one<{ declared_headcount: number }>(sql`SELECT declared_headcount FROM businesses WHERE id = ${inv.business_id} FOR UPDATE`);
    const c = await t.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM company_members WHERE business_id = ${inv.business_id}`);
    if (c.n >= b.declared_headcount) throw conflict("This company has reached its declared headcount.");
    try {
      await t.exec(sql`INSERT INTO company_members (user_id, business_id) VALUES (${user.id}, ${inv.business_id})`);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw conflict("You already belong to a company.");
      throw e;
    }
    await t.exec(sql`UPDATE company_invitations SET status = 'accepted', responded_at = now() WHERE id = ${id}`);
    await t.exec(sql`UPDATE company_invitations SET status = 'cancelled', responded_at = now() WHERE worker_id = ${user.id} AND status = 'pending'`);
    await notify(t, { userId: inv.invited_by, type: "invitation_accepted", title: "Worker joined", body: `${user.fullName} accepted and is now listed under ${inv.name}.` });
    return { ok: true, accepted: true };
  });
});
