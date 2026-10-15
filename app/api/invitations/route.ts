import { db, sql } from "@/lib/db";
import { userRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = userRoute({ role: "worker" }, async ({ user }) => {
  const rows = await db.rows<{ id: string; business_name: string; created_at: Date }>(sql`
    SELECT i.id, b.name AS business_name, i.created_at
    FROM company_invitations i JOIN businesses b ON b.id = i.business_id
    WHERE i.worker_id = ${user.id} AND i.status = 'pending' ORDER BY i.created_at DESC`);
  return { invitations: rows.map((r) => ({ id: r.id, businessName: r.business_name, createdAt: r.created_at })) };
});
