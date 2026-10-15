import { db, sql } from "@/lib/db";
import { badRequest, readJson, userRoute } from "@/lib/http";
import { array, bool, object, optional, parse, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const GET = userRoute({}, async ({ user }) => {
  const rows = await db.rows<{ id: string; type: string; title: string; body: string; data: Record<string, string>; created_at: Date; read_at: Date | null }>(sql`
    SELECT id, type, title, body, data, created_at, read_at FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`);
  return { notifications: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, data: r.data, createdAt: r.created_at, read: r.read_at !== null })) };
});

// Mark as read. (Read notifications are deleted ~1 day later by the cron sweep; unread ones after 2 months.)
export const POST = userRoute({}, async ({ req, user }) => {
  const d = parse(object({ ids: optional(array(uuid, { max: 100 })), all: optional(bool) }), await readJson(req, 8_192));
  if (!d.all && !d.ids?.length) throw badRequest("Nothing to mark as read.");
  await db.exec(sql`
    UPDATE notifications SET read_at = now()
    WHERE user_id = ${user.id} AND read_at IS NULL AND (${d.all === true} OR id = ANY(${d.ids ?? []}::uuid[]))`);
  return { ok: true };
});
