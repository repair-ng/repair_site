import { canActForCustomer } from "@/lib/access";
import { db, sql } from "@/lib/db";
import { conflict, notFound, userRoute } from "@/lib/http";
import { startPayment } from "@/lib/payments";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Retry payment for a job still waiting on its fee.
export const POST = userRoute<{ id: string }>({ limit: { name: "job-pay", max: 20, windowMs: 3_600_000 } }, async ({ user, params }) => {
  const id = parseUuid(params.id);
  const j = await db.maybe<{ customer_id: string; status: string; fee_kobo: number }>(sql`SELECT customer_id, status, fee_kobo FROM jobs WHERE id = ${id}`);
  if (!j || !(await canActForCustomer(user.id, j.customer_id))) throw notFound();
  if (j.status !== "pending_payment") throw conflict("This job has already been paid for.");
  return { ok: true, ...(await startPayment({ userId: user.id, kind: "job_fee", amountKobo: j.fee_kobo, subjectId: id })) };
});
