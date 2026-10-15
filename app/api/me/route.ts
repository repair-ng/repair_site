import { getMembership } from "@/lib/access";
import { db, sql } from "@/lib/db";
import { userRoute } from "@/lib/http";
import { postingDelayMinutes } from "@/lib/rules";
import { workerStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const GET = userRoute({}, async ({ user }) => {
  const u = await db.one<{ email: string; phone: string; address: string; services: string[]; has_avatar: boolean }>(sql`
    SELECT email, phone, address, services, avatar_key IS NOT NULL AS has_avatar FROM users WHERE id = ${user.id}`);
  const unread = await db.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${user.id} AND read_at IS NULL`);
  const base = {
    id: user.id, role: user.role, customerKind: user.customerKind, fullName: user.fullName, companyName: user.companyName,
    email: u.email, phone: u.phone, address: u.address, areaId: user.areaId, services: u.services,
    avatarUrl: u.has_avatar ? `/api/files/avatar/${user.id}` : null, unreadNotifications: unread.n,
  };
  if (user.role === "worker") {
    const [stats, membership, invites] = await Promise.all([
      workerStats(user.id),
      getMembership(user.id),
      db.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM company_invitations WHERE worker_id = ${user.id} AND status = 'pending'`),
    ]);
    return { ...base, stats, membership, pendingInvitations: invites.n };
  }
  return { ...base, points: user.points, postingDelayMinutes: postingDelayMinutes(user.points) };
});
