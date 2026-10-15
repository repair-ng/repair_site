import { Db, db, sql } from "./db";
import { forbidden } from "./http";
import { SessionUser } from "./auth";

export type Membership = {
  businessId: string; role: "member" | "admin"; isOwner: boolean; name: string;
  status: "awaiting_payment" | "active" | "suspended"; declaredHeadcount: number; planActive: boolean;
};

export async function getMembership(userId: string, d: Db = db): Promise<Membership | null> {
  const r = await d.maybe<{
    business_id: string; role: "member" | "admin"; owner_id: string; name: string;
    status: Membership["status"]; declared_headcount: number; plan_active: boolean;
  }>(sql`
    SELECT m.business_id, m.role, b.owner_id, b.name, b.status, b.declared_headcount,
           (b.status = 'active' AND b.plan_paid_until > now()) AS plan_active
    FROM company_members m JOIN businesses b ON b.id = m.business_id
    WHERE m.user_id = ${userId}`);
  return r && { businessId: r.business_id, role: r.role, isOwner: r.owner_id === userId, name: r.name, status: r.status, declaredHeadcount: r.declared_headcount, planActive: r.plan_active };
}

/** Caller must be a worker who is an ADMIN of a company. */
export async function requireCompanyAdmin(user: SessionUser, d: Db = db): Promise<Membership> {
  const m = user.role === "worker" ? await getMembership(user.id, d) : null;
  if (!m || m.role !== "admin") throw forbidden("Only company admins can do that.");
  return m;
}

export async function requireCompanyOwner(user: SessionUser, d: Db = db): Promise<Membership> {
  const m = await requireCompanyAdmin(user, d);
  if (!m.isOwner) throw forbidden("Only the company owner can do that.");
  return m;
}

/** A customer may act for themselves, or for a customer-company that designated them admin. */
export async function canActForCustomer(userId: string, customerId: string, d: Db = db): Promise<boolean> {
  if (userId === customerId) return true;
  const r = await d.maybe(sql`SELECT 1 FROM customer_company_admins WHERE company_id = ${customerId} AND admin_user_id = ${userId}`);
  return r !== null;
}
