# Security notes

## What "sanitising all input" means here (and why it isn't "strip the quotes")
Blacklisting quotes/keywords is unreliable and corrupts real data (O'Brien). Injection is stopped structurally, then input is validated:

| Threat | Control | Where |
|---|---|---|
| **SQL injection** | Every query is built with the `` sql`...` `` tag: values become `$1,$2…` parameters sent separately from the SQL text. The DB layer accepts only that type — a concatenated string is a compile error *and* throws at runtime. Dynamic filters are composed from fixed fragments; no user text ever becomes an identifier/ORDER BY. `LIKE` input is escaped (`%`, `_`, `\`). | `lib/db.ts`, `lib/security.ts` |
| Defence in depth for SQLi | DB constraints (CHECK/UNIQUE/FK); least-privilege `repair_app` role (no DDL); `statement_timeout`. | `db/migrations`, `db/roles.sql` |
| Malformed / hostile input | Strict schemas on **every** endpoint: type, length, format, enum; unknown fields rejected (mass-assignment, `__proto__`); Unicode NFKC; NUL/control/bidi/zero-width stripped; phones → E.164; JSON bodies size-capped while streaming. | `lib/validate.ts`, `lib/http.ts` |
| XSS | React escapes output; no `dangerouslySetInnerHTML`; CSP, `nosniff`, `X-Frame-Options`; uploads are image-only (magic-byte sniffed; SVG/HTML rejected) and served with `nosniff` + sandbox CSP. | `next.config.js`, `lib/storage.ts` |
| CSRF | `SameSite=Lax` HttpOnly Secure cookies **and** Origin check on every mutating `/api` call. | `middleware.ts`, `lib/origin.ts` |
| Auth | scrypt password hashes; sessions stored as SHA-256 (raw token never in DB); constant-time login, per-IP + per-account throttling, 15-min lockout after 8 failures; generic error messages. | `lib/auth.ts`, `api/auth/login` |
| IDOR / broken access control | Every resource handler re-checks ownership/role; non-participants get 404; contact details + street address only revealed to the two parties on a job; workers list exposes no email/phone. | route handlers, `lib/access.ts` |
| Payment fraud | Prices decided server-side; webhook HMAC (fail-closed) + server-to-server verify + amount/currency match + idempotent settlement; callback page re-verifies, never trusts the redirect. | `lib/payments.ts`, `api/payment/webhook` |
| Race conditions | First-come claiming is one atomic `UPDATE … WHERE status='open'`; headcount/points use row locks in transactions. | `api/jobs/[id]/claim`, `api/business/*` |
| Bots | Honeypot field, per-IP signup limits (add Cloudflare Turnstile if abuse appears). | `api/auth/register` |
| File upload | 2 MB cap before parsing, magic-byte check, server-generated random keys (no user filenames → no path traversal), private bucket. | `lib/storage.ts` |

## Things you must do
- **Rotate the Paystack key in the zip you shared.** `.env` (a `sk_test_…` key) was inside `Repair_1.zip`. Test keys can't move money, but rotate it in the Paystack dashboard and run `git log --all -- .env` to be sure it was never committed. This delivery excludes `.env`.
- Keep secrets only in Dokploy's Environment tab.
- Run `npm audit` periodically and keep Next.js patched (the repo pins 14.2.35).

## Known gaps / next steps
- No email/phone verification or password reset yet (needs an email provider such as Resend/Brevo).
- No 2FA; no admin console.
- CSP allows inline scripts (Next bootstrap). Move to nonce-based CSP later.
- Google Maps address autocomplete is not wired; proximity uses the chosen **area** (+ lat/lng when supplied, haversine distance). The DB/API already store `place_id`, `lat`, `lng`.
