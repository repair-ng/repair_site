import { LOCATION_IDS } from "@/lib/config";
import { db, joinSql, sql } from "@/lib/db";
import { queryObject, userRoute } from "@/lib/http";
import { escapeLike } from "@/lib/security";
import { object, oneOf, optional, parse, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Search active worker-companies (customer companies use this to pick who to book).
export const GET = userRoute({}, async ({ req }) => {
  const f = parse(object({ q: optional(str({ max: 60 })), areaId: optional(oneOf(LOCATION_IDS)) }), queryObject(req));
  const conds = [sql`b.status = 'active' AND b.plan_paid_until > now()`];
  if (f.q) conds.push(sql`b.name ILIKE ${`%${escapeLike(f.q)}%`}`);
  if (f.areaId) conds.push(sql`b.area_id = ${f.areaId}`);
  const rows = await db.rows<{ id: string; name: string; area_id: string; members: number }>(sql`
    SELECT b.id, b.name, b.area_id, (SELECT count(*)::int FROM company_members m WHERE m.business_id = b.id) AS members
    FROM businesses b WHERE ${joinSql(conds, sql` AND `)} ORDER BY b.name, b.id LIMIT 30`);
  return { businesses: rows.map((r) => ({ id: r.id, name: r.name, areaId: r.area_id, workers: r.members })) };
});
