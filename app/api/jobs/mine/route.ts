import { db, sql } from "@/lib/db";
import { userRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

// Customer side: my jobs (+ jobs of companies I'm a designated admin for). Worker side: jobs I claimed.
export const GET = userRoute({}, async ({ user }) => {
  const rows = await db.rows<{ id: string; title: string; status: string; is_express: boolean; area_id: string; created_at: Date; worker_id: string | null; worker_name: string | null; customer_id: string; rated: boolean; engage_deadline: Date | null }>(sql`
    SELECT j.id, j.title, j.status, j.is_express, j.area_id, j.created_at, j.worker_id, w.full_name AS worker_name, j.customer_id, j.engage_deadline,
           EXISTS (SELECT 1 FROM ratings r WHERE r.job_id = j.id) AS rated
    FROM jobs j LEFT JOIN users w ON w.id = j.worker_id
    WHERE j.customer_id = ${user.id}
       OR j.customer_id IN (SELECT company_id FROM customer_company_admins WHERE admin_user_id = ${user.id})
       OR j.worker_id = ${user.id}
    ORDER BY j.created_at DESC LIMIT 100`);
  return {
    jobs: rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, isExpress: r.is_express, areaId: r.area_id, createdAt: r.created_at,
      workerName: r.worker_name, rated: r.rated, engageDeadline: r.engage_deadline,
      asWorker: r.worker_id === user.id, // true => I'm the worker; false => I'm on the customer side
    })),
  };
});
