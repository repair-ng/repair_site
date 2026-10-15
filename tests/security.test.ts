import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, joinSql, db } from "../lib/db";
import { object, str, email, phone, password, uuid, oneOf, int, array, optional, parse, ValidationError, cleanText, normalizePhone } from "../lib/validate";
import { escapeLike, safeEqual, rateLimit, clientIp } from "../lib/security";
import { verifyWebhookSignature } from "../lib/paystack";
import { sniffImage } from "../lib/storage";

const EVIL = ["'; DROP TABLE users; --", "' OR '1'='1", "1; SELECT pg_sleep(10)", "\\' UNION SELECT password_hash FROM users --", "Robert'); DROP TABLE students;--"];

test("sql`` puts user input in parameters, never in the query text", () => {
  for (const e of EVIL) {
    const q = sql`SELECT * FROM users WHERE full_name = ${e} AND id = ${5}`;
    assert.equal(q.text, "SELECT * FROM users WHERE full_name = $1 AND id = $2");
    assert.deepEqual(q.values, [e, 5]);
    assert.ok(!q.text.includes("DROP") && !q.text.includes("UNION"));
  }
});
test("nested fragments are renumbered correctly", () => {
  const conds = [sql`a = ${"x"}`, sql`b = ${"y"}`, sql`c = ${"z"}`];
  const q = sql`SELECT 1 WHERE ${sql`k = ${1}`} AND ${joinSql(conds, sql` AND `)} LIMIT ${10}`;
  assert.equal(q.text, "SELECT 1 WHERE k = $1 AND a = $2 AND b = $3 AND c = $4 LIMIT $5");
  assert.deepEqual(q.values, [1, "x", "y", "z", 10]);
});
test("query runner refuses plain strings (no concatenated SQL possible)", async () => {
  await assert.rejects(() => db.rows("SELECT * FROM users WHERE id = '" + EVIL[0] + "'" as never), /not built with sql/);
});

test("validators: strict objects reject unknown fields (mass assignment)", () => {
  const s = object({ name: str({ max: 20 }) });
  assert.throws(() => parse(s, { name: "ok", is_admin: true }), ValidationError);
  assert.throws(() => parse(s, JSON.parse('{"name":"ok","__proto__":{"x":1}}')), ValidationError);
  assert.throws(() => parse(s, "nope"), ValidationError);
  assert.throws(() => parse(s, [1]), ValidationError);
});
test("validators: injection strings are treated as plain bounded text", () => {
  assert.equal(parse(str({ max: 50 }), "O'Brien"), "O'Brien"); // legit names are not mangled
  assert.throws(() => parse(str({ max: 5 }), EVIL[0]), ValidationError); // but length is enforced
  assert.throws(() => parse(email, "a@b.com'; DROP TABLE users;--"), ValidationError);
  assert.throws(() => parse(uuid, "1' OR '1'='1"), ValidationError);
  assert.throws(() => parse(oneOf(["a", "b"] as const), "a' OR 1=1"), ValidationError);
  assert.throws(() => parse(int({ min: 1, max: 9 }), "1 OR 1=1"), ValidationError);
  assert.throws(() => parse(phone, "0803'; --"), ValidationError);
});
test("cleanText strips NUL, control, bidi and zero-width chars; normalises unicode", () => {
  assert.equal(cleanText("a\u0000b\u202Ec\u200Bd\u0007"), "abcd");
  assert.equal(cleanText("ＡＢＣ"), "ABC");
  assert.equal(cleanText("  a \n\t b  "), "a b");
  assert.equal(cleanText("l1\r\n\r\n\r\n\r\nl2", true), "l1\n\nl2");
});
test("phone normalisation", () => {
  assert.equal(normalizePhone("0803 123 4567"), "+2348031234567");
  assert.equal(normalizePhone("+234 803-123-4567"), "+2348031234567");
  assert.equal(normalizePhone("2348031234567"), "+2348031234567");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("0803abc"), null);
});
test("password and array rules", () => {
  assert.throws(() => parse(password, "short1"), ValidationError);
  assert.throws(() => parse(password, "onlyletterslong"), ValidationError);
  assert.equal(parse(password, "correct horse 7"), "correct horse 7");
  assert.throws(() => parse(array(str({ max: 5 }), { max: 2 }), ["a", "b", "c"]), ValidationError);
  assert.deepEqual(parse(object({ x: optional(str({ max: 5 })) }), { x: "" }), {});
});

test("escapeLike makes % _ \\ literal", () => {
  assert.equal(escapeLike("100%_\\"), "100\\%\\_\\\\");
});
test("safeEqual / clientIp / rateLimit", () => {
  assert.ok(safeEqual("abc", "abc")); assert.ok(!safeEqual("abc", "abd")); assert.ok(!safeEqual("abc", "abcd"));
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 41.1.1.1" })), "41.1.1.1"); // last hop, not client-supplied
  const k = "t" + Math.random();
  assert.ok(rateLimit(k, 2, 1000).ok); assert.ok(rateLimit(k, 2, 1000).ok); assert.ok(!rateLimit(k, 2, 1000).ok);
});

test("paystack webhook signature: valid / tampered / missing / no key (fail closed)", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "RP-abc" } });
  process.env.PAYSTACK_SECRET_KEY = "sk_test_secret";
  const sig = crypto.createHmac("sha512", "sk_test_secret").update(body).digest("hex");
  assert.ok(verifyWebhookSignature(body, sig));
  assert.ok(!verifyWebhookSignature(body + " ", sig));
  assert.ok(!verifyWebhookSignature(body, sig.slice(0, -2) + "00"));
  assert.ok(!verifyWebhookSignature(body, null));
  assert.ok(!verifyWebhookSignature(body, "short"));
  delete process.env.PAYSTACK_SECRET_KEY;
  assert.ok(!verifyWebhookSignature(body, sig)); // no key => reject everything
});

test("sniffImage accepts real images only", () => {
  const pad = Buffer.alloc(20);
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad])), "jpg");
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad])), "png");
  assert.equal(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), pad])), "webp");
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>' + " ".repeat(20))), null);
  assert.equal(sniffImage(Buffer.from("GIF89a" + " ".repeat(30))), null);
  assert.equal(sniffImage(Buffer.from("<html><script>alert(1)</script></html>")), null);
});
