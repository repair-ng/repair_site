import { canActForCustomer } from "@/lib/access";
import { LOCATION_IDS, SERVICE_IDS } from "@/lib/config";
import { db, joinSql, sql } from "@/lib/db";
import { badRequest, forbidden, queryObject, readJson, userRoute } from "@/lib/http";
import { buildKeywords } from "@/lib/jobs";
import { startPayment } from "@/lib/payments";
import { EXPRESS_JOB_FEE_KOBO, JOB_FEE_KOBO, distanceKm, recommendationScore } from "@/lib/rules";
import { escapeLike } from "@/lib/security";
import { array, bool, int, num, object, oneOf, optional, parse, str, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------- job board (workers)
const boardQuery = object({
  q: optional(str({ max: 60 })),                 // keyword search, e.g. "phone fixing", "roofing"
  serviceId: optional(oneOf(SERVICE_IDS)),
  areaId: optional(oneOf(LOCATION_IDS)),
  express: optional(bool),
  page: optional(int({ min: 1, max: 1000 })),
});
const PAGE = 25;

export const GET = userRoute({ role: "worker", limit: { name: "board", max: 90, windowMs: 60_000 } }, async ({ req, user }) => {
  const f = parse(boardQuery, queryObject(req));
  // Only jobs that have reached their visible_at time (this is how low customer points delay a post).
  const conds = [sql`j.status = 'open' AND j.visible_at <= now()`];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conds.push(sql`(j.title ILIKE ${like} OR j.description ILIKE ${like} OR array_to_string(j.keywords, ' ') ILIKE ${like})`);
  }
  if (f.serviceId) conds.push(sql`j.service_id = ${f.serviceId}`);
  if (f.areaId) conds.push(sql`j.area_id = ${f.areaId}`);
  if (f.express !== undefined) conds.push(sql`j.is_express = ${f.express}`);
  const where = joinSql(conds, sql` AND `);
  const rows = await db.rows<{ id: string; title: string; description: string; service_id: string; keywords: string[]; area_id: string; lat: number | null; lng: number | null; is_express: boolean; timeline: string | null; requirements: string | null; visible_at: Date; customer_points: number }>(sql`
    SELECT j.id, j.title, j.description, j.service_id, j.keywords, j.area_id, j.lat, j.lng, j.is_express, j.timeline, j.requirements, j.visible_at, u.points AS customer_points
    FROM jobs j JOIN users u ON u.id = j.customer_id
    WHERE ${where} ORDER BY j.visible_at DESC, j.id LIMIT ${PAGE} OFFSET ${((f.page ?? 1) - 1) * PAGE}`);
  const total = await db.one<{ n: number }>(sql`SELECT count(*)::int AS n FROM jobs j WHERE ${where}`);
  const me = { areaId: user.areaId, lat: user.lat, lng: user.lng };
  return {
    total: total.n, page: f.page ?? 1, pageSize: PAGE,
    jobs: rows.map((r) => {
      const geo = { areaId: r.area_id, lat: r.lat, lng: r.lng };
      const km = distanceKm(geo, me);
      return {
        id: r.id, title: r.title, description: r.description, serviceId: r.service_id, keywords: r.keywords, areaId: r.area_id,
        isExpress: r.is_express, timeline: r.timeline, requirements: r.requirements, postedAt: r.visible_at, customerPoints: r.customer_points,
        sameArea: r.area_id === user.areaId, distanceKm: km === null ? null : Math.round(km * 10) / 10,
        recommendationScore: Math.round(recommendationScore(geo, me, null)),
        // NOTE: street address and contact details are deliberately NOT on the public board.
      };
    }),
  };
});

// ---------------------------------------------------------------- post a job (customers)
const createSchema = object({
  customerId: optional(uuid),                    // set only when a designated admin posts for a customer company
  title: str({ min: 3, max: 120 }),
  description: str({ min: 5, max: 2000, multiline: true }),
  serviceId: oneOf(SERVICE_IDS),
  keywords: optional(array(str({ min: 2, max: 30, lower: true, pattern: /^[\p{L}\p{N}][\p{L}\p{N} \-]*$/u }), { max: 8, unique: true })),
  areaId: optional(oneOf(LOCATION_IDS)),
  address: optional(str({ min: 5, max: 300 })),  // editable: defaults to the customer's saved address
  lat: optional(num({ min: -90, max: 90 })),
  lng: optional(num({ min: -180, max: 180 })),
  express: optional(bool),
  timeline: optional(str({ min: 3, max: 200 })),
  requirements: optional(str({ min: 3, max: 1000, multiline: true })),
});

export const POST = userRoute({ limit: { name: "job-create", max: 20, windowMs: 3_600_000 } }, async ({ req, user }) => {
  const d = parse(createSchema, await readJson(req, 16_384));
  const customerId = d.customerId ?? user.id;
  if (customerId !== user.id && !(await canActForCustomer(user.id, customerId))) throw forbidden();
  const c = await db.maybe<{ address: string; area_id: string; lat: number | null; lng: number | null }>(sql`
    SELECT address, area_id, lat, lng FROM users WHERE id = ${customerId} AND role = 'customer' AND is_active`);
  if (!c) throw forbidden("Only customer accounts can post jobs.");
  const express = d.express === true;
  if (express && (!d.timeline || !d.requirements)) throw badRequest("Express orders need a timeline and specific requirements.");
  if ((d.lat === undefined) !== (d.lng === undefined)) throw badRequest("Provide both latitude and longitude, or neither.");

  const fee = express ? EXPRESS_JOB_FEE_KOBO : JOB_FEE_KOBO; // price is decided here, never by the client
  const job = await db.one<{ id: string }>(sql`
    INSERT INTO jobs (customer_id, title, description, service_id, keywords, area_id, address, lat, lng, is_express, timeline, requirements, fee_kobo)
    VALUES (${customerId}, ${d.title}, ${d.description}, ${d.serviceId}, ${buildKeywords(d.serviceId, d.keywords ?? [], d.title)}::text[],
            ${d.areaId ?? c.area_id}, ${d.address ?? c.address}, ${d.lat ?? (d.address ? null : c.lat)}, ${d.lng ?? (d.address ? null : c.lng)},
            ${express}, ${d.timeline ?? null}, ${d.requirements ?? null}, ${fee})
    RETURNING id`);
  const pay = await startPayment({ userId: user.id, kind: "job_fee", amountKobo: fee, subjectId: job.id });
  return { jobId: job.id, feeKobo: fee, ...pay };
});
