# RE-PAIR

Marketplace for repair artisans and customers (Next.js 14 · PostgreSQL · MinIO · Paystack), self-hosted on Dokploy.

- **Deploy:** `docs/DEPLOYMENT.md`
- **Security model:** `docs/SECURITY.md`
- **Rules & fees (tune here):** `lib/rules.ts` · areas/services: `lib/config.ts`

Local dev: set `DATABASE_URL` + `S3_*` (see `.env.example`), then `npm install && npm run migrate && npm run dev`.
With no `PAYSTACK_SECRET_KEY` (non-production only) payments auto-succeed so you can click through. Tests: `npm test`.
