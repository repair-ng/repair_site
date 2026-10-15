import { Db, sql } from "./db";

export type NotificationInput = { userId: string; type: string; title: string; body: string; data?: Record<string, string> };

export async function notify(d: Db, n: NotificationInput): Promise<void> {
  await d.exec(sql`
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (${n.userId}, ${n.type}, ${n.title}, ${n.body}, ${JSON.stringify(n.data ?? {})}::jsonb)`);
}

export async function notifyMany(d: Db, userIds: string[], n: Omit<NotificationInput, "userId">): Promise<void> {
  if (userIds.length === 0) return;
  await d.exec(sql`
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT u, ${n.type}, ${n.title}, ${n.body}, ${JSON.stringify(n.data ?? {})}::jsonb
    FROM unnest(${userIds}::uuid[]) AS u`);
}
