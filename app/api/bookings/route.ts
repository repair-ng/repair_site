import { getMembership } from "@/lib/access";
import { db, sql, tx } from "@/lib/db";
import { badRequest, forbidden, notFound, readJson, userRoute } from "@/lib/http";
import { notify, notifyMany } from "@/lib/notify";
import { lagosDate, nextOccurrence, Frequency } from "@/lib/rules";
import { isoDate, object, oneOf, optional, parse, str, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; description: string; frequency: Frequency; start_date: string; end_date: string | null; status: string; customer_name: string; business_name: string; business_id: string; customer_id: string };

// Customer companies see the bookings they made; worker-company admins see bookings made to their company.
export const GET = userRoute({}, async ({ user }) => {
  const m = user.role === "worker" ? await getMembership(user.id) : null;
  const rows = await db.rows<Row>(sql`
    SELECT b.id, b.title, b.description, b.frequency, to_char(b.start_date, 'YYYY-MM-DD') AS start_date, to_char(b.end_date, 'YYYY-MM-DD') AS end_date, b.status,
           coalesce(c.company_name, c.full_name) AS customer_name, z.name AS business_name, b.business_id, b.customer_id
    FROM bookings b JOIN users c ON c.id = b.customer_id JOIN businesses z ON z.id = b.business_id
    WHERE b.customer_id = ${user.id} OR b.business_id = ${m?.role === "admin" ? m.businessId : null}
    ORDER BY b.created_at DESC LIMIT 200`);
  const today = lagosDate();
  return {
    bookings: rows.map((r) => ({
      id: r.id, title: r.title, description: r.description, frequency: r.frequency, startDate: r.start_date, endDate: r.end_date, status: r.status,
      customerName: r.customer_name, businessName: r.business_name,
      nextDate: r.status === "accepted" ? nextOccurrence(r.frequency, r.start_date, r.end_date, today) : null,
      side: r.customer_id === user.id ? "customer" : "business",
    })),
  };
});

const schema = object({
  businessId: uuid,
  title: str({ min: 3, max: 120 }),
  description: str({ min: 5, max: 2000, multiline: true }),
  frequency: oneOf(["daily", "weekly", "monthly", "yearly"] as const),
  startDate: isoDate,
  endDate: optional(isoDate),
});

export const POST = userRoute({ role: "customer", limit: { name: "booking", max: 30, windowMs: 3_600_000 } }, async ({ req, user }) => {
  if (user.customerKind !== "company") throw forbidden("Recurring bookings are for customer-company accounts.");
  const d = parse(schema, await readJson(req, 8_192));
  if (d.startDate < lagosDate()) throw badRequest("The start date can't be in the past.");
  if (d.endDate && d.endDate < d.startDate) throw badRequest("The end date must be after the start date.");
  return tx(async (t) => {
    const b = await t.maybe<{ id: string; name: string }>(sql`SELECT id, name FROM businesses WHERE id = ${d.businessId} AND status = 'active' AND plan_paid_until > now()`);
    if (!b) throw notFound("That company isn't accepting bookings right now.");
    const bk = await t.one<{ id: string }>(sql`
      INSERT INTO bookings (customer_id, business_id, title, description, frequency, start_date, end_date)
      VALUES (${user.id}, ${b.id}, ${d.title}, ${d.description}, ${d.frequency}, ${d.startDate}::date, ${d.endDate ?? null}::date) RETURNING id`);
    const admins = await t.rows<{ user_id: string }>(sql`SELECT user_id FROM company_members WHERE business_id = ${b.id} AND role = 'admin'`);
    await notifyMany(t, admins.map((a) => a.user_id), { type: "booking_request", title: "New booking request", body: `${user.companyName ?? user.fullName} wants a ${d.frequency} booking: "${d.title}". Accept or deny it on the bookings page.`, data: { bookingId: bk.id } });
    return { ok: true, bookingId: bk.id };
  });
});
