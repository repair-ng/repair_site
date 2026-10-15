import { getMembership } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

export const POST = userRoute({ role: "worker" }, async ({ user }) =>
  tx(async (t) => {
    const m = await getMembership(user.id, t);
    if (!m) throw conflict("You're not in a company.");
    if (m.isOwner) throw conflict("Owners can't leave their own company.");
    await t.exec(sql`DELETE FROM company_members WHERE user_id = ${user.id}`);
    const admins = await t.rows<{ user_id: string }>(sql`SELECT user_id FROM company_members WHERE business_id = ${m.businessId} AND role = 'admin'`);
    for (const a of admins) await notify(t, { userId: a.user_id, type: "worker_left", title: "A worker left", body: `${user.fullName} left ${m.name}.` });
    return { ok: true };
  })
);
