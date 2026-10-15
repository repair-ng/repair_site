import { requireCompanyAdmin, requireCompanyOwner } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { forbidden, notFound, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { object, oneOf, parse, parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Remove a worker from the company. The worker is always notified (so nobody is silently dropped or exploited).
export const DELETE = userRoute<{ userId: string }>({ role: "worker" }, async ({ user, params }) => {
  const targetId = parseUuid(params.userId);
  return tx(async (t) => {
    const m = await requireCompanyAdmin(user, t);
    const owner = await t.one<{ owner_id: string }>(sql`SELECT owner_id FROM businesses WHERE id = ${m.businessId}`);
    if (targetId === owner.owner_id) throw forbidden("The company owner can't be removed.");
    const removed = await t.maybe(sql`DELETE FROM company_members WHERE user_id = ${targetId} AND business_id = ${m.businessId} RETURNING user_id`);
    if (!removed) throw notFound("That worker isn't in your company.");
    await notify(t, { userId: targetId, type: "removed_from_company", title: "Removed from a company", body: `You were removed from ${m.name}. You can now join or be invited by another company.`, data: { businessId: m.businessId } });
    return { ok: true };
  });
});

// Owner designates / revokes company admins (admins can rate, award points, and manage members).
export const PATCH = userRoute<{ userId: string }>({ role: "worker" }, async ({ req, user, params }) => {
  const targetId = parseUuid(params.userId);
  const d = parse(object({ role: oneOf(["member", "admin"] as const) }), await readJson(req, 512));
  return tx(async (t) => {
    const m = await requireCompanyOwner(user, t);
    if (targetId === user.id) throw forbidden("The owner is always an admin.");
    const r = await t.maybe(sql`UPDATE company_members SET role = ${d.role} WHERE user_id = ${targetId} AND business_id = ${m.businessId} RETURNING user_id`);
    if (!r) throw notFound("That worker isn't in your company.");
    await notify(t, { userId: targetId, type: "role_changed", title: "Your company role changed", body: `You are now ${d.role === "admin" ? "an admin" : "a member"} of ${m.name}.` });
    return { ok: true };
  });
});
