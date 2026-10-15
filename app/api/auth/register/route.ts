import { createSession, hashPassword } from "@/lib/auth";
import { LOCATION_IDS, SERVICE_IDS } from "@/lib/config";
import { db, sql } from "@/lib/db";
import { HttpError, badRequest, publicRoute } from "@/lib/http";
import { MAX_AVATAR_BYTES, deleteObject, putAvatar, sniffImage } from "@/lib/storage";
import { array, email, num, object, oneOf, optional, parse, password, phone, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const schema = object({
  role: oneOf(["worker", "customer"] as const),
  customerKind: optional(oneOf(["individual", "company"] as const)),
  fullName: str({ min: 2, max: 100 }),
  companyName: optional(str({ min: 2, max: 120 })),
  email,
  phone,
  password,
  address: str({ min: 5, max: 300 }),
  areaId: oneOf(LOCATION_IDS),
  placeId: optional(str({ max: 200, pattern: /^[A-Za-z0-9_-]+$/ })),
  lat: optional(num({ min: -90, max: 90 })),
  lng: optional(num({ min: -180, max: 180 })),
  services: optional(array(oneOf(SERVICE_IDS), { max: 10, unique: true })),
  website: optional(str({ max: 200 })), // honeypot: real people never see/fill this
});

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const POST = publicRoute({ limit: { name: "register", max: 10, windowMs: 3_600_000 } }, async ({ req }) => {
  // multipart/form-data (the profile photo travels with the form). Cap the size BEFORE parsing.
  const len = Number(req.headers.get("content-length") ?? "");
  if (!Number.isFinite(len) || len <= 0) throw new HttpError(411, "Content-Length is required.");
  if (len > MAX_AVATAR_BYTES + 64 * 1024) throw new HttpError(413, "Upload too large — profile photos must be under 2 MB.");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) throw new HttpError(415, "Send the form as multipart/form-data.");

  const form = await req.formData();
  const fields: Record<string, unknown> = {};
  let file: File | null = null;
  for (const [key, value] of form.entries()) {
    if (FORBIDDEN_KEYS.has(key)) throw badRequest("Invalid field.");
    if (typeof value !== "string") {
      if (key !== "avatar" || file) throw badRequest("Unexpected file.");
      file = value;
    } else if (key === "services") {
      ((fields.services ??= []) as string[]).push(value);
    } else if (Object.prototype.hasOwnProperty.call(fields, key)) {
      throw badRequest("Duplicate field.");
    } else {
      fields[key] = value;
    }
  }
  const d = parse(schema, fields);

  if (d.website) return { ok: true }; // bot: pretend it worked, create nothing

  if ((d.lat === undefined) !== (d.lng === undefined)) throw badRequest("Provide both latitude and longitude, or neither.");
  if (d.role === "worker") {
    if (!file) throw badRequest("A profile picture is required for workers.");
    if (!d.services || d.services.length === 0) throw badRequest("Choose at least one service you offer.");
    if (d.customerKind || d.companyName) throw badRequest("Workers can't set customer fields.");
  } else {
    if (!d.customerKind) throw badRequest("Choose individual or company.");
    if (d.customerKind === "company" && !d.companyName) throw badRequest("Company name is required.");
    if (d.customerKind === "individual" && d.companyName) throw badRequest("Company name is only for company accounts.");
  }
  if (d.password.toLowerCase().includes(d.email.split("@")[0]) && d.email.split("@")[0].length >= 4) throw badRequest("Your password shouldn't contain your email name.");

  let avatarKey: string | null = null;
  if (file) {
    if (file.size > MAX_AVATAR_BYTES) throw new HttpError(413, "Profile photo must be under 2 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniffImage(buf);
    if (!ext) throw badRequest("Profile photo must be a JPEG, PNG or WebP image.");
    avatarKey = await putAvatar(buf, ext);
  }

  try {
    const passwordHash = await hashPassword(d.password);
    const u = await db.one<{ id: string }>(sql`
      INSERT INTO users (role, customer_kind, full_name, company_name, email, phone, address, area_id, place_id, lat, lng, avatar_key, services, password_hash)
      VALUES (${d.role}, ${d.role === "customer" ? d.customerKind! : null}, ${d.fullName}, ${d.companyName ?? null}, ${d.email}, ${d.phone},
              ${d.address}, ${d.areaId}, ${d.placeId ?? null}, ${d.lat ?? null}, ${d.lng ?? null}, ${avatarKey},
              ${d.role === "worker" ? d.services! : []}::text[], ${passwordHash})
      RETURNING id`);
    await createSession(u.id);
    return { ok: true, id: u.id };
  } catch (e) {
    if (avatarKey) await deleteObject(avatarKey); // don't orphan the photo if signup failed
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "An account with that email or phone number already exists.");
    throw e;
  }
});
