import { NextResponse } from "next/server";
import { db, sql } from "@/lib/db";
import { notFound, userRoute } from "@/lib/http";
import { getObject } from "@/lib/storage";
import { parseUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// The object key comes from OUR database (never from the URL), so there is no path traversal.
export const GET = userRoute<{ userId: string }>({ limit: { name: "avatar", max: 600, windowMs: 60_000 } }, async ({ params }) => {
  const id = parseUuid(params.userId);
  const row = await db.maybe<{ avatar_key: string | null }>(sql`SELECT avatar_key FROM users WHERE id = ${id}`);
  if (!row?.avatar_key) throw notFound();
  const obj = await getObject(row.avatar_key);
  if (!obj) throw notFound();
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
});
