// ---------------------------------------------------------------------------
// Input validation & sanitisation.
//
// Rules of the road:
//  * Parse, don't trust: every request body/query goes through a schema here
//    before any handler logic runs. Unknown fields are REJECTED (blocks mass
//    assignment) and every field has a type, length and format limit.
//  * Text is normalised (Unicode NFKC) and stripped of control characters,
//    NULs and invisible/bidi-override characters.
//  * We deliberately do NOT try to "strip quotes / SQL keywords" — that is
//    unreliable and corrupts legitimate names (O'Brien). SQL injection is
//    prevented by parameterised queries (see lib/db.ts); this layer makes
//    sure the data is well-formed and bounded.
// ---------------------------------------------------------------------------

export type Issue = { path: string; message: string };

export class ValidationError extends Error {
  constructor(public issues: Issue[]) {
    super("Validation failed");
  }
}

export interface Rule<T> {
  (v: unknown, path: string, issues: Issue[]): T | undefined;
  optional?: boolean;
}
type OptionalRule<T> = Rule<T> & { optional: true };

// NUL + C0/C1 controls (except tab/LF/CR, handled separately), zero-width and
// bidi-override characters, BOM.
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function cleanText(input: string, multiline = false): string {
  let s = input.normalize("NFKC").replace(BAD_CHARS, "");
  if (multiline) {
    s = s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");
  }
  return s.trim();
}

function fail(issues: Issue[], path: string, message: string): undefined {
  issues.push({ path, message });
  return undefined;
}

type StrOpts = { min?: number; max: number; multiline?: boolean; pattern?: RegExp; lower?: boolean; message?: string };

export function str(o: StrOpts): Rule<string> {
  return (v, path, issues) => {
    if (typeof v !== "string") return fail(issues, path, "Must be text.");
    let s = cleanText(v, o.multiline);
    if (o.lower) s = s.toLowerCase();
    if (s.length < (o.min ?? 1)) return fail(issues, path, o.min && o.min > 1 ? `Must be at least ${o.min} characters.` : "Required.");
    if (s.length > o.max) return fail(issues, path, `Must be at most ${o.max} characters.`);
    if (o.pattern && !o.pattern.test(s)) return fail(issues, path, o.message ?? "Invalid format.");
    return s;
  };
}

export const email: Rule<string> = (v, path, issues) => {
  const s = str({ max: 254, lower: true })(v, path, issues);
  if (s === undefined) return undefined;
  // Pragmatic check: one @, no spaces, dot in the domain. Real validation is the confirmation email.
  if (!/^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]{2,}$/.test(s)) return fail(issues, path, "Enter a valid email address.");
  return s;
};

/** Accepts 0803..., +234803..., 234803... and normalises Nigerian numbers to E.164. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?[0-9]+$/.test(digits)) return null;
  let m = /^0([789][01]\d{8})$/.exec(digits);
  if (m) return `+234${m[1]}`;
  m = /^\+?234([789][01]\d{8})$/.exec(digits);
  if (m) return `+234${m[1]}`;
  if (/^\+[1-9][0-9]{9,14}$/.test(digits)) return digits; // other countries, already E.164
  return null;
}

export const phone: Rule<string> = (v, path, issues) => {
  const s = str({ max: 25 })(v, path, issues);
  if (s === undefined) return undefined;
  const n = normalizePhone(s);
  return n ?? fail(issues, path, "Enter a valid phone number, e.g. 0803 123 4567.");
};

/** Passwords are NOT trimmed/normalised (they're hashed), only length-bounded. */
export const password: Rule<string> = (v, path, issues) => {
  if (typeof v !== "string") return fail(issues, path, "Must be text.");
  if (v.length < 10) return fail(issues, path, "Use at least 10 characters.");
  if (v.length > 128) return fail(issues, path, "Use at most 128 characters.");
  if (v.includes("\u0000")) return fail(issues, path, "Invalid character.");
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return fail(issues, path, "Include at least one letter and one number.");
  return v;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuid: Rule<string> = (v, path, issues) =>
  typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : fail(issues, path, "Invalid id.");

export function int(o: { min: number; max: number }): Rule<number> {
  return (v, path, issues) => {
    const n = typeof v === "string" && /^-?\d{1,15}$/.test(v.trim()) ? Number(v) : v;
    if (typeof n !== "number" || !Number.isInteger(n)) return fail(issues, path, "Must be a whole number.");
    if (n < o.min || n > o.max) return fail(issues, path, `Must be between ${o.min} and ${o.max}.`);
    return n;
  };
}

export function num(o: { min: number; max: number }): Rule<number> {
  return (v, path, issues) => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return fail(issues, path, "Must be a number.");
    if (n < o.min || n > o.max) return fail(issues, path, `Must be between ${o.min} and ${o.max}.`);
    return n;
  };
}

export const bool: Rule<boolean> = (v, path, issues) => {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return fail(issues, path, "Must be true or false.");
};

export function oneOf<T extends string>(allowed: readonly T[]): Rule<T> {
  return (v, path, issues) =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fail(issues, path, "Not an allowed value.");
}

/** Real calendar date, YYYY-MM-DD. */
export const isoDate: Rule<string> = (v, path, issues) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(issues, path, "Use the format YYYY-MM-DD.");
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return fail(issues, path, "Not a real date.");
  return v;
};

export function optional<T>(rule: Rule<T>): OptionalRule<T> {
  const r = ((v, path, issues) => {
    if (v === undefined || v === null || v === "") return undefined;
    return rule(v, path, issues);
  }) as OptionalRule<T>;
  r.optional = true;
  return r;
}

export function array<T>(rule: Rule<T>, o: { max: number; min?: number; unique?: boolean }): Rule<T[]> {
  return (v, path, issues) => {
    if (!Array.isArray(v)) return fail(issues, path, "Must be a list.");
    if (v.length > o.max) return fail(issues, path, `At most ${o.max} items.`);
    if (v.length < (o.min ?? 0)) return fail(issues, path, `At least ${o.min} item(s).`);
    const out: T[] = [];
    v.forEach((item, i) => {
      const x = rule(item, `${path}[${i}]`, issues);
      if (x !== undefined) out.push(x);
    });
    return o.unique ? Array.from(new Set(out)) : out;
  };
}

type Shape = Record<string, Rule<any>>;
type Req<S extends Shape> = { [K in keyof S as S[K] extends { optional: true } ? never : K]: S[K] extends Rule<infer T> ? T : never };
type Opt<S extends Shape> = { [K in keyof S as S[K] extends { optional: true } ? K : never]?: S[K] extends Rule<infer T> ? T : never };
export type Infer<S extends Shape> = Req<S> & Opt<S>;

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Strict object: only declared keys allowed, everything else is an error. */
export function object<S extends Shape>(shape: S): Rule<Infer<S>> {
  return (v, path, issues) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return fail(issues, path, "Must be an object.");
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return fail(issues, path, "Must be a plain object.");
    const input = v as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      if (!hasOwn(shape, key)) issues.push({ path: path ? `${path}.${key}` : key, message: "Unexpected field." });
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const rule = shape[key];
      const p = path ? `${path}.${key}` : key;
      const raw = hasOwn(input, key) ? input[key] : undefined;
      if (rule.optional && (raw === undefined || raw === null || raw === "")) continue;
      if (raw === undefined && !rule.optional) {
        issues.push({ path: p, message: "Required." });
        continue;
      }
      const parsed = rule(raw, p, issues);
      if (parsed !== undefined) out[key] = parsed;
    }
    return out as Infer<S>;
  };
}

export function parse<T>(rule: Rule<T>, input: unknown): T {
  const issues: Issue[] = [];
  const out = rule(input, "", issues);
  if (issues.length > 0 || out === undefined) throw new ValidationError(issues);
  return out;
}

/** Validates a URL path/query id. */
export function parseUuid(input: unknown): string {
  return parse(uuid, input);
}
