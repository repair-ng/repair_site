import { db, sql } from "@/lib/db";
import { notFound, userRoute } from "@/lib/http";
import { workerStats } from "@/lib/stats";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Public worker profile incl. historical yearly ratings (visible to customers, workers and companies).
export const GET = userRoute<{ id: string }>({}, async ({ params }) => {
  const id = parseUuid(params.id);
  const w = await db.maybe<{ id: string; full_name: string; area_id: string; services: string[]; has_avatar: boolean; company_name: string | null; created_at: Date }>(sql`
    SELECT u.id, u.full_name, u.area_id, u.services, u.avatar_key IS NOT NULL AS has_avatar, u.created_at,
           (SELECT b.name FROM company_members m JOIN businesses b ON b.id = m.business_id WHERE m.user_id = u.id) AS company_name
    FROM users u WHERE u.id = ${id} AND u.role = 'worker' AND u.is_active`);
  if (!w) throw notFound();
  return {
    id: w.id, fullName: w.full_name, areaId: w.area_id, services: w.services, companyName: w.company_name, memberSince: w.created_at,
    avatarUrl: w.has_avatar ? `/api/files/avatar/${w.id}` : null, stats: await workerStats(w.id),
  };
});
