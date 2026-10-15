import { sql, tx } from "@/lib/db";
import { notFound, userRoute } from "@/lib/http";
import { notifyMany } from "@/lib/notify";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = userRoute<{ id: string }>({ role: "customer" }, async ({ user, params }) => {
  const id = parseUuid(params.id);
  return tx(async (t) => {
    const b = await t.maybe<{ business_id: string; title: string }>(sql`
      UPDATE bookings SET status = 'cancelled' WHERE id = ${id} AND customer_id = ${user.id} AND status IN ('pending','accepted') RETURNING business_id, title`);
    if (!b) throw notFound();
    const admins = await t.rows<{ user_id: string }>(sql`SELECT user_id FROM company_members WHERE business_id = ${b.business_id} AND role = 'admin'`);
    await notifyMany(t, admins.map((a) => a.user_id), { type: "booking_cancelled", title: "Booking cancelled", body: `${user.companyName ?? user.fullName} cancelled "${b.title}".`, data: { bookingId: id } });
    return { ok: true };
  });
});
