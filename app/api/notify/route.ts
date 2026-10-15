import { db, sql } from "@/lib/db";
import { publicRoute, readJson } from "@/lib/http";
import { email, object, parse } from "@/lib/validate";

export const dynamic = "force-dynamic";

// "Notify me when you launch near me" — stored in Postgres (validated, parameterised, rate-limited).
export const POST = publicRoute({ limit: { name: "notify", max: 5, windowMs: 3_600_000 } }, async ({ req }) => {
  const d = parse(object({ email }), await readJson(req, 1_024));
  await db.exec(sql`INSERT INTO location_requests (email) VALUES (${d.email})`);
  return { ok: true };
});
