import crypto from "node:crypto";
import { Db, db, sql, tx } from "./db";
import { HttpError } from "./http";
import { LOCATIONS } from "./config";
import { initializeTransaction, paystackConfigured, verifyTransaction } from "./paystack";
import { EXPRESS_LEAD_MINUTES, PLAN_PERIOD_DAYS, postingDelayMinutes, recommendationScore } from "./rules";
import { notify, notifyMany } from "./notify";

export type PaymentKind = "job_fee" | "business_skip_fee" | "business_plan";

/**
 * Creates a payment row (amount decided SERVER-SIDE — the client never sends a price)
 * and returns the Paystack checkout URL.
 */
export async function startPayment(p: { userId: string; kind: PaymentKind; amountKobo: number; subjectId: string | null }) {
  const reference = `RP-${crypto.randomBytes(12).toString("hex")}`;
  const user = await db.one<{ email: string; full_name: string }>(sql`SELECT email, full_name FROM users WHERE id = ${p.userId}`);
  await db.exec(sql`
    INSERT INTO payments (reference, user_id, kind, amount_kobo, subject_id)
    VALUES (${reference}, ${p.userId}, ${p.kind}, ${p.amountKobo}, ${p.subjectId})`);

  if (!paystackConfigured()) {
    if (process.env.NODE_ENV === "production") throw new HttpError(503, "Payments are temporarily unavailable.");
    await settlePaid(reference, p.amountKobo, "NGN"); // local dev only: simulate success
    return { reference, demo: true as const };
  }
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  try {
    const authorizationUrl = await initializeTransaction({
      email: user.email, amountKobo: p.amountKobo, reference,
      callbackUrl: `${base}/payment/callback`,
      metadata: { kind: p.kind, user_id: p.userId },
    });
    return { reference, authorizationUrl };
  } catch (e) {
    console.error("[paystack init]", (e as Error).message);
    await db.exec(sql`UPDATE payments SET status = 'failed' WHERE reference = ${reference} AND status = 'pending'`);
    throw new HttpError(502, "Couldn't start the payment. Please try again.");
  }
}

/** Confirms with Paystack (server-to-server), then settles. Safe to call repeatedly. */
export async function verifyAndSettle(reference: string): Promise<"paid" | "pending" | "failed" | "unknown"> {
  const row = await db.maybe<{ status: "pending" | "paid" | "failed" }>(sql`SELECT status FROM payments WHERE reference = ${reference}`);
  if (!row) return "unknown";
  if (row.status !== "pending") return row.status;
  const v = await verifyTransaction(reference);
  if (!v.success) return "pending";
  return settlePaid(reference, v.amountKobo, v.currency);
}

/**
 * Marks a payment paid and applies its effect — exactly once. The row lock plus the
 * `status = 'pending'` check makes webhook retries/replays and the browser callback
 * racing each other harmless (idempotent).
 */
export async function settlePaid(reference: string, amountKobo: number, currency: string): Promise<"paid" | "failed" | "pending"> {
  return tx(async (t) => {
    const p = await t.maybe<{ id: string; status: string; kind: PaymentKind; amount_kobo: number; user_id: string; subject_id: string | null }>(sql`
      SELECT id, status, kind, amount_kobo, user_id, subject_id FROM payments WHERE reference = ${reference} FOR UPDATE`);
    if (!p) return "failed";
    if (p.status === "paid") return "paid";
    if (p.status === "failed") return "failed";
    if (amountKobo !== p.amount_kobo || currency !== "NGN") {
      // Paid the wrong amount / currency: never grant value.
      console.error("[payment mismatch]", { reference, expected: p.amount_kobo, got: amountKobo, currency });
      await t.exec(sql`UPDATE payments SET status = 'failed' WHERE id = ${p.id}`);
      return "failed";
    }
    await t.exec(sql`UPDATE payments SET status = 'paid', paid_at = now() WHERE id = ${p.id}`);

    switch (p.kind) {
      case "job_fee":
        if (p.subject_id) await publishJob(t, p.subject_id);
        break;
      case "business_plan": {
        const b = await t.maybe<{ owner_id: string }>(sql`
          UPDATE businesses
          SET plan_paid_until = greatest(coalesce(plan_paid_until, now()), now()) + make_interval(days => ${PLAN_PERIOD_DAYS}), status = 'active'
          WHERE id = ${p.subject_id} RETURNING owner_id`);
        if (b) await notify(t, { userId: b.owner_id, type: "plan_paid", title: "Company plan paid", body: `Your company plan is active for another ${PLAN_PERIOD_DAYS} days.` });
        break;
      }
      case "business_skip_fee":
        await notify(t, { userId: p.user_id, type: "skip_fee_paid", title: "Payment received", body: "You can now register your business — the job requirement has been waived." });
        break;
    }
    return "paid";
  });
}

async function publishJob(t: Db, jobId: string) {
  const job = await t.maybe<{ id: string; customer_id: string; title: string; is_express: boolean; service_id: string; area_id: string; lat: number | null; lng: number | null }>(sql`
    SELECT id, customer_id, title, is_express, service_id, area_id, lat, lng
    FROM jobs WHERE id = ${jobId} AND status = 'pending_payment' FOR UPDATE`);
  if (!job) return;
  const c = await t.one<{ points: number }>(sql`SELECT points FROM users WHERE id = ${job.customer_id}`);
  // Low customer points => the job takes longer to reach the board. Express jobs
  // additionally wait 1 minute so recommended workers get a head-start alert.
  const delay = postingDelayMinutes(c.points) + (job.is_express ? EXPRESS_LEAD_MINUTES : 0);
  await t.exec(sql`UPDATE jobs SET status = 'open', visible_at = now() + make_interval(mins => ${delay}) WHERE id = ${job.id}`);
  await notify(t, { userId: job.customer_id, type: "job_posted", title: "Job posted", body: `"${job.title}" is ${delay > 0 ? `going live on the job board in ${delay} min` : "now live on the job board"}.`, data: { jobId: job.id } });

  if (job.is_express) {
    const candidates = await t.rows<{ id: string; area_id: string; lat: number | null; lng: number | null; rating: number | null }>(sql`
      SELECT u.id, u.area_id, u.lat, u.lng, (SELECT avg(r.stars)::float8 FROM ratings r WHERE r.worker_id = u.id) AS rating
      FROM users u
      WHERE u.role = 'worker' AND u.is_active AND ${job.service_id} = ANY(u.services)
      ORDER BY (u.area_id = ${job.area_id}) DESC LIMIT 200`);
    const top = candidates
      .map((w) => ({ id: w.id, score: recommendationScore({ areaId: job.area_id, lat: job.lat, lng: job.lng }, { areaId: w.area_id, lat: w.lat, lng: w.lng }, w.rating) }))
      .sort((a, b) => b.score - a.score).slice(0, 10).map((w) => w.id);
    const area = LOCATIONS.find((l) => l.id === job.area_id)?.name ?? job.area_id;
    await notifyMany(t, top, { type: "express_job", title: "Express job near you", body: `"${job.title}" in ${area} hits the job board in ${delay} min — get ready to claim it.`, data: { jobId: job.id } });
  }
}
