import { canActForCustomer } from "@/lib/access";
import { LOCATION_IDS } from "@/lib/config";
import { db, sql } from "@/lib/db";
import { badRequest, notFound, readJson, userRoute } from "@/lib/http";
import { num, object, oneOf, optional, parse, parseUuid, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string; customer_id: string; title: string; description: string; service_id: string; keywords: string[]; area_id: string; address: string;
  is_express: boolean; timeline: string | null; requirements: string | null; status: string; worker_id: string | null; engage_deadline: Date | null;
  created_at: Date; c_name: string; c_phone: string; w_name: string | null; w_phone: string | null;
};

// Full details (address + the other party's phone) are revealed ONLY to the two parties on the job.
export const GET = userRoute<{ id: string }>({}, async ({ user, params }) => {
  const id = parseUuid(params.id);
  const j = await db.maybe<JobRow>(sql`
    SELECT j.id, j.customer_id, j.title, j.description, j.service_id, j.keywords, j.area_id, j.address, j.is_express, j.timeline, j.requirements,
           j.status, j.worker_id, j.engage_deadline, j.created_at,
           c.full_name AS c_name, c.phone AS c_phone, w.full_name AS w_name, w.phone AS w_phone
    FROM jobs j JOIN users c ON c.id = j.customer_id LEFT JOIN users w ON w.id = j.worker_id WHERE j.id = ${id}`);
  if (!j) throw notFound();
  const isCustomerSide = await canActForCustomer(user.id, j.customer_id);
  const isWorker = j.worker_id === user.id;
  if (!isCustomerSide && !isWorker) throw notFound(); // 404 (not 403) so ids can't be probed
  const engaged = ["claimed", "engaged", "in_progress", "completed"].includes(j.status);
  return {
    id: j.id, title: j.title, description: j.description, serviceId: j.service_id, keywords: j.keywords, areaId: j.area_id, address: j.address,
    isExpress: j.is_express, timeline: j.timeline, requirements: j.requirements, status: j.status, createdAt: j.created_at, engageDeadline: j.engage_deadline,
    role: isCustomerSide ? "customer" : "worker",
    counterparty: engaged
      ? isCustomerSide ? { name: j.w_name, phone: j.w_phone, id: j.worker_id } : { name: j.c_name, phone: j.c_phone }
      : null,
  };
});

// Job addresses are editable (e.g. the customer isn't at home/work when the problem happens).
export const PATCH = userRoute<{ id: string }>({}, async ({ req, user, params }) => {
  const id = parseUuid(params.id);
  const d = parse(object({
    address: str({ min: 5, max: 300 }), areaId: optional(oneOf(LOCATION_IDS)), lat: optional(num({ min: -90, max: 90 })), lng: optional(num({ min: -180, max: 180 })),
  }), await readJson(req, 4_096));
  if ((d.lat === undefined) !== (d.lng === undefined)) throw badRequest("Provide both latitude and longitude, or neither.");
  const j = await db.maybe<{ customer_id: string; status: string }>(sql`SELECT customer_id, status FROM jobs WHERE id = ${id}`);
  if (!j || !(await canActForCustomer(user.id, j.customer_id))) throw notFound();
  if (["completed", "cancelled"].includes(j.status)) throw badRequest("This job is closed.");
  await db.exec(sql`
    UPDATE jobs SET address = ${d.address}, area_id = coalesce(${d.areaId ?? null}, area_id), lat = ${d.lat ?? null}, lng = ${d.lng ?? null} WHERE id = ${id}`);
  return { ok: true };
});
