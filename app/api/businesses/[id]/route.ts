import { db, sql } from "@/lib/db";
import { notFound, userRoute } from "@/lib/http";
import { businessStats } from "@/lib/stats";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Public company profile with current + historical yearly ratings.
export const GET = userRoute<{ id: string }>({}, async ({ params }) => {
  const id = parseUuid(params.id);
  const b = await db.maybe<{ id: string; name: string; description: string | null; area_id: string; members: number }>(sql`
    SELECT b.id, b.name, b.description, b.area_id, (SELECT count(*)::int FROM company_members m WHERE m.business_id = b.id) AS members
    FROM businesses b WHERE b.id = ${id}`);
  if (!b) throw notFound();
  return { id: b.id, name: b.name, description: b.description, areaId: b.area_id, workers: b.members, stats: await businessStats(b.id) };
});
