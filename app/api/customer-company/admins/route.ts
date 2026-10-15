import { db, sql } from "@/lib/db";
import { forbidden, notFound, readJson, userRoute } from "@/lib/http";
import { email, object, parse, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

function requireCompany(user: { customerKind: string | null }) {
  if (user.customerKind !== "company") throw forbidden("Only customer-company accounts have admins.");
}

export const GET = userRoute({ role: "customer" }, async ({ user }) => {
  requireCompany(user);
  const rows = await db.rows<{ id: string; full_name: string }>(sql`
    SELECT u.id, u.full_name FROM customer_company_admins a JOIN users u ON u.id = a.admin_user_id WHERE a.company_id = ${user.id}`);
  return { admins: rows.map((r) => ({ id: r.id, fullName: r.full_name })) };
});

// Designate a registered user (by email) who may post/accept/complete/rate jobs for the company.
export const POST = userRoute({ role: "customer", limit: { name: "cc-admin", max: 20, windowMs: 3_600_000 } }, async ({ req, user }) => {
  requireCompany(user);
  const d = parse(object({ email }), await readJson(req, 512));
  const target = await db.maybe<{ id: string }>(sql`SELECT id FROM users WHERE lower(email) = ${d.email} AND is_active`);
  if (!target) throw notFound("No registered user has that email.");
  if (target.id === user.id) throw forbidden("You're already the account owner.");
  await db.exec(sql`INSERT INTO customer_company_admins (company_id, admin_user_id) VALUES (${user.id}, ${target.id}) ON CONFLICT DO NOTHING`);
  return { ok: true };
});

export const DELETE = userRoute({ role: "customer" }, async ({ req, user }) => {
  requireCompany(user);
  const d = parse(object({ adminId: uuid }), await readJson(req, 512));
  await db.exec(sql`DELETE FROM customer_company_admins WHERE company_id = ${user.id} AND admin_user_id = ${d.adminId}`);
  return { ok: true };
});
