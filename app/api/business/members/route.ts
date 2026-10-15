import { requireCompanyAdmin } from "@/lib/access";
import { db, sql } from "@/lib/db";
import { queryObject, userRoute } from "@/lib/http";
import { lagosYear, lagosYearStart } from "@/lib/rules";
import { escapeLike } from "@/lib/security";
import { StatRow, summarize, workerStatCols } from "@/lib/stats";
import { object, optional, parse, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Company "Workers" tab: list + search by name.
export const GET = userRoute({ role: "worker" }, async ({ req, user }) => {
  const m = await requireCompanyAdmin(user);
  const f = parse(object({ q: optional(str({ max: 60 })) }), queryObject(req));
  const like = f.q ? `%${escapeLike(f.q)}%` : "%";
  const rows = await db.rows<StatRow & { id: string; full_name: string; role: string; joined_at: Date; has_avatar: boolean }>(sql`
    SELECT u.id, u.full_name, cm.role, cm.joined_at, u.avatar_key IS NOT NULL AS has_avatar,
           ${workerStatCols(lagosYearStart(lagosYear()))}
    FROM company_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.business_id = ${m.businessId} AND u.full_name ILIKE ${like}
    ORDER BY u.full_name, u.id LIMIT 200`);
  return {
    members: rows.map((r) => ({ id: r.id, fullName: r.full_name, role: r.role, joinedAt: r.joined_at, avatarUrl: r.has_avatar ? `/api/files/avatar/${r.id}` : null, ...summarize(r) })),
  };
});
