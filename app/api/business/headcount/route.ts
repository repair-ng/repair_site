import { requireCompanyOwner } from "@/lib/access";
import { db, sql, tx } from "@/lib/db";
import { conflict, readJson, userRoute } from "@/lib/http";
import { monthlyFeeKobo } from "@/lib/rules";
import { int, object, parse } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const PATCH = userRoute({ role: "worker" }, async ({ req, user }) => {
  const d = parse(object({ headcount: int({ min: 1, max: 100_000 }) }), await readJson(req, 1_024));
  return tx(async (t) => {
    const m = await requireCompanyOwner(user, t);
    await t.one(sql`SELECT id FROM businesses WHERE id = ${m.businessId} FOR UPDATE`); // serialise with invitations
    const c = await t.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM company_members WHERE business_id = ${m.businessId}`);
    if (c.n > d.headcount) {
      // The warning from the spec: cannot shrink below the workers already registered.
      throw conflict(`Warning: you already have ${c.n} workers registered, which is more than ${d.headcount}. Remove workers first, or choose ${c.n} or more.`);
    }
    const fee = monthlyFeeKobo(d.headcount);
    await t.exec(sql`UPDATE businesses SET declared_headcount = ${d.headcount}, monthly_fee_kobo = ${fee} WHERE id = ${m.businessId}`);
    return { ok: true, declaredHeadcount: d.headcount, monthlyFeeKobo: fee };
  });
});
