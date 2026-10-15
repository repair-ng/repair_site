import { db, sql, tx } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { REMINDER_OFFSETS, addDays, lagosDate, occursOn, Frequency } from "@/lib/rules";
import { HttpError, publicRoute } from "@/lib/http";
import { safeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Housekeeping, run every minute by a Dokploy Schedule (see docs/DEPLOYMENT.md):
//   * give back jobs whose worker didn't engage within 15 minutes
//   * delete notifications (unread > 2 months, read > 1 day)
//   * booking reminders at 3 days / 1 day / day-of (each sent exactly once)
//   * suspend companies whose monthly plan lapsed
//   * purge unpaid job drafts and expired sessions
// Protected by a shared secret header (and rate-limited).
// ---------------------------------------------------------------------------
export const POST = publicRoute({ limit: { name: "cron", max: 30, windowMs: 60_000 } }, async ({ req }) => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length < 24 || !safeEqual(given, secret)) throw new HttpError(403, "Forbidden.");

  const out: Record<string, number> = {};

  // 1. Unengaged claims go back on the board.
  const released = await db.rows<{ id: string; title: string; worker_id: string }>(sql`
    WITH exp AS (
      SELECT id, title, worker_id FROM jobs WHERE status = 'claimed' AND engage_deadline < now() FOR UPDATE SKIP LOCKED
    ), upd AS (
      UPDATE jobs j SET status = 'open', worker_id = NULL, business_id = NULL, claimed_at = NULL, engage_deadline = NULL
      FROM exp WHERE j.id = exp.id RETURNING exp.id, exp.title, exp.worker_id
    ) SELECT id, title, worker_id FROM upd`);
  for (const r of released) await notify(db, { userId: r.worker_id, type: "claim_expired", title: "Claim expired", body: `You didn't engage within 15 minutes, so "${r.title}" went back on the job board.` });
  out.claimsReleased = released.length;

  // 2. Notification retention.
  out.notificationsDeleted = await db.exec(sql`
    DELETE FROM notifications
    WHERE (read_at IS NULL AND created_at < now() - interval '2 months') OR (read_at IS NOT NULL AND read_at < now() - interval '1 day')`);

  // 3. Booking reminders.
  const today = lagosDate();
  const bookings = await db.rows<{ id: string; title: string; frequency: Frequency; start_date: string; end_date: string | null; customer_id: string; business_id: string }>(sql`
    SELECT b.id, b.title, b.frequency, to_char(b.start_date, 'YYYY-MM-DD') AS start_date, to_char(b.end_date, 'YYYY-MM-DD') AS end_date, b.customer_id, b.business_id
    FROM bookings b JOIN businesses z ON z.id = b.business_id
    WHERE b.status = 'accepted' AND b.start_date <= ${addDays(today, 3)}::date AND (b.end_date IS NULL OR b.end_date >= ${today}::date)`);
  let reminders = 0;
  for (const b of bookings) {
    for (const offset of REMINDER_OFFSETS) {
      const date = addDays(today, offset);
      if (!occursOn(b.frequency, b.start_date, b.end_date, date)) continue;
      await tx(async (t) => {
        const fresh = await t.maybe(sql`
          INSERT INTO booking_reminders (booking_id, occurrence_date, offset_days) VALUES (${b.id}, ${date}::date, ${offset})
          ON CONFLICT DO NOTHING RETURNING booking_id`);
        if (!fresh) return;
        const admins = await t.rows<{ user_id: string }>(sql`SELECT user_id FROM company_members WHERE business_id = ${b.business_id} AND role = 'admin'`);
        const people = await t.rows<{ admin_user_id: string }>(sql`SELECT admin_user_id FROM customer_company_admins WHERE company_id = ${b.customer_id}`);
        const when = offset === 0 ? "today" : offset === 1 ? "tomorrow" : `in ${offset} days (${date})`;
        await notifyMany(t, Array.from(new Set([b.customer_id, ...people.map((p) => p.admin_user_id), ...admins.map((a) => a.user_id)])), {
          type: "booking_reminder", title: "Booking reminder", body: `"${b.title}" is ${when}.`, data: { bookingId: b.id },
        });
        reminders++;
      });
    }
  }
  out.bookingReminders = reminders;

  // 4. Lapsed company plans.
  const lapsed = await db.rows<{ owner_id: string; name: string }>(sql`
    UPDATE businesses SET status = 'suspended' WHERE status = 'active' AND plan_paid_until < now() RETURNING owner_id, name`);
  for (const l of lapsed) await notify(db, { userId: l.owner_id, type: "plan_lapsed", title: "Company plan expired", body: `${l.name} is suspended until the monthly plan is paid.` });
  out.plansSuspended = lapsed.length;

  // 5. Cleanup.
  out.draftJobsDeleted = await db.exec(sql`DELETE FROM jobs WHERE status = 'pending_payment' AND created_at < now() - interval '1 day'`);
  out.sessionsDeleted = await db.exec(sql`DELETE FROM sessions WHERE expires_at < now()`);

  return { ok: true, ...out };
});
