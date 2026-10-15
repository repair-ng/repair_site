import { requireCompanyAdmin } from "@/lib/access";
import { sql, tx } from "@/lib/db";
import { conflict, notFound, readJson, userRoute } from "@/lib/http";
import { notify } from "@/lib/notify";
import { bool, object, parse, parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = userRoute<{ id: string }>({ role: "worker" }, async ({ req, user, params }) => {
  const id = parseUuid(params.id);
  const d = parse(object({ accept: bool }), await readJson(req, 512));
  return tx(async (t) => {
    const m = await requireCompanyAdmin(user, t);
    const b = await t.maybe<{ customer_id: string; title: string }>(sql`
      UPDATE bookings SET status = ${d.accept ? "accepted" : "denied"}, responded_at = now()
      WHERE id = ${id} AND business_id = ${m.businessId} AND status = 'pending' RETURNING customer_id, title`);
    if (!b) {
      if (!(await t.maybe(sql`SELECT 1 FROM bookings WHERE id = ${id} AND business_id = ${m.businessId}`))) throw notFound();
      throw conflict("This booking was already answered.");
    }
    await notify(t, { userId: b.customer_id, type: "booking_response", title: d.accept ? "Booking accepted" : "Booking declined", body: `${m.name} ${d.accept ? "accepted" : "declined"} "${b.title}". ${d.accept ? "You'll get reminders 3 days, 1 day and on the day." : ""}`.trim(), data: { bookingId: id } });
    return { ok: true };
  });
});
