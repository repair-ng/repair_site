import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

// MinIO speaks the S3 API. The app talks to it over the PRIVATE Docker network
// (S3_ENDPOINT=http://repair-minio:9000), so uploads/downloads never leave the host.
// The bucket stays private: images are streamed to users through /api/files/*,
// which enforces login — there are no public object URLs to leak or scrape.

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.S3_ENDPOINT;
    if (!endpoint || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) throw new Error("S3_* environment variables are not set");
    client = new S3Client({
      endpoint,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: true, // required for MinIO
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
    });
  }
  return client;
}
const bucket = () => process.env.S3_BUCKET || "repair-media";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
export type ImageExt = keyof typeof TYPES;

/** Identify an image by its magic bytes — never trust the filename or the client's Content-Type. */
export function sniffImage(buf: Buffer): ImageExt | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null; // SVG, GIF, HTML, PDF, etc. are all rejected
}

/** Stores the avatar under a server-generated random key (user input never touches the object path). */
export async function putAvatar(buf: Buffer, ext: ImageExt): Promise<string> {
  const key = `avatars/${crypto.randomUUID()}.${ext}`;
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buf, ContentType: TYPES[ext], CacheControl: "private, max-age=300" }));
  return key;
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => {});
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const ext = key.split(".").pop() as ImageExt;
  if (!/^avatars\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key) || !(ext in TYPES)) return null; // only keys we generated
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body) return null;
    return { body: Buffer.from(await res.Body.transformToByteArray()), contentType: TYPES[ext] };
  } catch {
    return null;
  }
}
