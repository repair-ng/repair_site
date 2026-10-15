import { NextResponse } from "next/server";
import { db, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Used by Docker/Dokploy healthchecks. Reveals nothing beyond up/down.
export async function GET() {
  try {
    await db.one(sql`SELECT 1 AS ok`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
