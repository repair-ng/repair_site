import { LOCATION_IDS, SERVICE_IDS } from "@/lib/config";
import { db, joinSql, sql } from "@/lib/db";
import { queryObject, userRoute } from "@/lib/http";
import { lagosYear, lagosYearStart } from "@/lib/rules";
import { escapeLike } from "@/lib/security";
import { StatRow, summarize, workerStatCols } from "@/lib/stats";
import { int, object, oneOf, optional, parse, str, bool } from "@/lib/validate";

export const dynamic = "force-dynamic";

const schema = object({
  q: optional(str({ max: 60 })),
  areaId: optional(oneOf(LOCATION_IDS)),
  serviceId: optional(oneOf(SERVICE_IDS)),
  unaffiliated: optional(bool), // only workers not already in a company
  page: optional(int({ min: 1, max: 1000 })),
});
const PAGE = 20;

// The "RE-PAIR workers" tab. Only public profile fields are returned — never email/phone/address.
export const GET = userRoute({ limit: { name: "workers", max: 120, windowMs: 60_000 } }, async ({ req }) => {
  const f = parse(schema, queryObject(req));
  const conds = [sql`u.role = 'worker' AND u.is_active`];
  if (f.q) { const like = `%${escapeLike(f.q)}%`; conds.push(sql`u.full_name ILIKE ${like}`); }
  if (f.areaId) conds.push(sql`u.area_id = ${f.areaId}`);
  if (f.serviceId) conds.push(sql`${f.serviceId} = ANY(u.services)`);
  if (f.unaffiliated) conds.push(sql`NOT EXISTS (SELECT 1 FROM company_members m WHERE m.user_id = u.id)`);
  const where = joinSql(conds, sql` AND `);
  const yearStart = lagosYearStart(lagosYear());
  const rows = await db.rows<StatRow & { id: string; full_name: string; area_id: string; services: string[]; company_name: string | null; has_avatar: boolean }>(sql`
    SELECT u.id, u.full_name, u.area_id, u.services, u.avatar_key IS NOT NULL AS has_avatar,
           (SELECT b.name FROM company_members m JOIN businesses b ON b.id = m.business_id WHERE m.user_id = u.id) AS company_name,
           ${workerStatCols(yearStart)}
    FROM users u WHERE ${where}
    ORDER BY u.full_name, u.id LIMIT ${PAGE} OFFSET ${((f.page ?? 1) - 1) * PAGE}`);
  return {
    workers: rows.map((r) => ({
      id: r.id, fullName: r.full_name, areaId: r.area_id, services: r.services, companyName: r.company_name,
      avatarUrl: r.has_avatar ? `/api/files/avatar/${r.id}` : null, ...summarize(r),
    })),
    page: f.page ?? 1, pageSize: PAGE,
  };
});
