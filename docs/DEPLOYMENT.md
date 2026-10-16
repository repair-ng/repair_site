# Deploying RE-PAIR on a single VPS with Dokploy

**Stack:** Next.js web-app · PostgreSQL · MinIO · Paystack webhook — all on one Dokploy server, Let's Encrypt HTTPS via Dokploy's Traefik. No Vercel, no Upstash.

## 0. Architecture & networking strategy

```
Internet ──443──▶ Traefik (Dokploy, Let's Encrypt)
                    ├─ app.example.com      ─▶ web-app :3000   (UI, API, /api/payment/webhook)
                    ├─ s3.example.com       ─▶ minio   :9000   (S3 API)
                    └─ minio.example.com    ─▶ minio   :9001   (Console)

dokploy-network (private, Docker-internal, nothing published on the host)
   web-app ──▶ repair-postgres:5432      (DATABASE_URL)
   web-app ──▶ repair-minio:9000         (S3_ENDPOINT, plain HTTP inside the network)
```

Rules that keep it private:

1. **Postgres has no public port.** In Dokploy's database "External Credentials", leave *External Port* **empty**.
2. **MinIO uses `expose`, never `ports`** (see `docker-compose.minio.yml`); Traefik reaches it through the Domains tab.
3. Only ports **22, 80, 443** should be open in the VPS firewall (plus Dokploy's panel port `3000` only if you don't put the panel behind a domain). *Docker-published ports bypass UFW*, so the safest policy is to publish nothing.
4. The web-app talks to Postgres/MinIO by Docker DNS name over `dokploy-network` — traffic never leaves the host.
5. The MinIO bucket stays **private**. The app streams images to logged-in users through `/api/files/avatar/<id>`; there are no public object URLs. (MinIO is exposed publicly as you asked, but the app does not depend on that — you may drop the `s3.` domain later.)

## 1. Prerequisites

- DNS **A records** → your VPS IP: `app.example.com`, `s3.example.com`, `minio.example.com`.
- Dokploy installed; its own domain configured with HTTPS (Settings → Server → Domain).
- Repo with this code pushed to GitHub/GitLab/Gitea (connect it under Dokploy → Settings → Git).
- A Paystack account (start in **Test mode**).

Generate secrets locally with **hex** (base64 contains `+ / =` which break database URLs): `openssl rand -hex 24` — one each for the Postgres owner password, `repair_app` password, MinIO root password, MinIO app key secret, and `CRON_SECRET`.

## 1a. FASTEST PATH — one Compose stack (recommended)

`docker-compose.yml` in the repo root defines everything: `repair-web`, `repair-db` (Postgres 16), `repair-minio`, and a one-shot `minio-init` that creates the private bucket and a bucket-scoped app key. The first Postgres start also creates the least-privilege `repair_app` role (`db/init/10-roles.sh`), so **steps 3b and the manual MinIO key/bucket creation below are done for you**.

1. Dokploy → project → **Create Service → Compose** → Provider **Git** (your repo/branch) → Compose Path `./docker-compose.yml`.
2. **Environment** tab:
   ```
   APP_BASE_URL=https://app.example.com
   POSTGRES_PASSWORD=<openssl rand -hex 24>
   REPAIR_APP_PASSWORD=<openssl rand -hex 24>
   MINIO_ROOT_USER=<not "minioadmin">
   MINIO_ROOT_PASSWORD=<openssl rand -hex 24>
   MINIO_API_DOMAIN=s3.example.com
   MINIO_CONSOLE_DOMAIN=minio.example.com
   S3_SECRET_KEY=<openssl rand -hex 24>
   PAYSTACK_SECRET_KEY=sk_test_...
   CRON_SECRET=<openssl rand -hex 24>
   ```
   (`S3_ACCESS_KEY` defaults to `repair-app`; `PAYSTACK_ENFORCE_IPS` defaults to `true`.) A missing required variable stops the deploy with a clear message.
3. **Domains** tab (HTTPS on, Let's Encrypt for each): `app.example.com` → service `repair-web` port `3000`; `s3.example.com` → `repair-minio` port `9000`; `minio.example.com` → `repair-minio` port `9001`.
4. **Deploy.** Logs should show `migrations up to date` from `repair-web`. Then continue at **step 5 (Paystack webhook)**, **6 (cron: target service `repair-web`)** and **7 (checklist)**.

Notes: `repair-db` is only on the stack's private network (no `ports`, not on `dokploy-network`). The role-creation script runs only when the `pgdata` volume is first created; if you deployed an earlier version first, delete that volume (data loss!) or apply `db/roles.sql` by hand. Everything below (Sections 2–4) is the alternative where Postgres and MinIO are separate Dokploy services.

## 2. (Alternative path) PostgreSQL as a Dokploy-managed database

1. Dokploy → **Create Project** `repair` → **Create Service → Database → PostgreSQL**.
2. App name `repair-postgres` · Database name `repair` · User `repair_owner` · strong password · image `postgres:16`.
3. **Deploy.** Open the service's *General → Internal Credentials* and note the **Internal Host** (Dokploy appends a random suffix to the app name, e.g. `repair-postgres-ab12cd`) — use exactly what the UI shows.
4. Leave **External Port empty** (no public exposure).
5. *Backups* tab → add an S3 destination (preferably **off-server**, e.g. a Backblaze B2/Wasabi bucket — a backup on the same disk dies with the server) and schedule `0 2 * * *`.

## 3. MinIO

1. In the project: **Create Service → Compose** (type *Docker Compose*), name `repair-minio`. Paste `docker-compose.minio.yml`.
2. *Environment* tab:
   ```
   MINIO_ROOT_USER=<admin-name-not-"minioadmin">
   MINIO_ROOT_PASSWORD=<strong, 20+ chars>
   MINIO_API_DOMAIN=s3.example.com
   MINIO_CONSOLE_DOMAIN=minio.example.com
   ```
3. *Domains* tab → add two domains, **HTTPS on, Certificate: Let's Encrypt**:
   - `s3.example.com` → service `minio`, container port **9000**
   - `minio.example.com` → service `minio`, container port **9001**
   Click **Preview Compose** to confirm Dokploy injected the Traefik labels, then **Deploy**.
4. Open `https://minio.example.com`, log in as root, then:
   - **Buckets → Create** `repair-media` (leave *public/anonymous access* **off**).
   - **Access Keys → Create** a key for the app and attach this policy (bucket-scoped, no admin rights):
     ```json
     {"Version":"2012-10-17","Statement":[{"Effect":"Allow",
       "Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],
       "Resource":["arn:aws:s3:::repair-media/*"]}]}
     ```
   - Copy the access/secret key into the app's `S3_ACCESS_KEY` / `S3_SECRET_KEY`. **Never give the app the root credentials.**
5. Harden the console: it is public by design here, so use a long root password and consider IP-restricting `minio.example.com` (Traefik IP allow-list middleware) or turning that domain off when you're not administering.

## 3b. The two Postgres roles (do after step 4's first deploy)

The first deploy creates the tables using the owner role. Then lock the app down:

1. Dokploy → `repair-postgres` → *Terminal* (or `docker exec -it <container> psql -U repair_owner repair`).
2. Paste `db/roles.sql` after replacing `CHANGE_ME` with the `repair_app` password.
3. In the web-app environment switch `DATABASE_URL` to the `repair_app` user and **redeploy**. (`MIGRATION_DATABASE_URL` keeps the owner so future migrations still work.)

## 4. Web application

1. **Create Service → Application** `repair-web` → *Provider*: your Git repo + branch → *Build Type*: **Dockerfile** (path `./Dockerfile`).
2. *Environment* tab (runtime secrets live **only** here, never in git):
   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `APP_BASE_URL` | `https://app.example.com` (https, no trailing `/`) |
   | `DATABASE_URL` | `postgresql://repair_owner:<pw>@<Internal Host>:5432/repair` *(owner for the first deploy; switch to `repair_app` per 3b)* |
   | `MIGRATION_DATABASE_URL` | `postgresql://repair_owner:<pw>@<Internal Host>:5432/repair` |
   | `S3_ENDPOINT` | `http://repair-minio:9000` |
   | `S3_REGION` / `S3_BUCKET` | `us-east-1` / `repair-media` |
   | `S3_ACCESS_KEY` / `S3_SECRET_KEY` | the bucket-scoped key from step 3 |
   | `PAYSTACK_SECRET_KEY` | `sk_test_…` first, `sk_live_…` when going live |
   | `PAYSTACK_ENFORCE_IPS` | `true` (set `false` if you put Cloudflare's orange-cloud proxy in front) |
   | `CRON_SECRET` | 24+ random chars |
3. *Domains* tab → `app.example.com` · container port **3000** · HTTPS on · Let's Encrypt.
4. **Deploy.** Dokploy attaches applications to `dokploy-network` automatically, so `<Internal Host>` and `repair-minio` resolve. On start the container runs `node scripts/migrate.mjs` (advisory-locked, transactional) and then the server. Check *Logs* for `migrations up to date`.
5. Health: `https://app.example.com/api/health` → `{"ok":true}`.

## 5. Paystack webhook

1. Paystack Dashboard → **Settings → API Keys & Webhooks**.
2. Set **Test Webhook URL** (and later **Live Webhook URL**) to:
   `https://app.example.com/api/payment/webhook`
3. What the endpoint does (already implemented in `app/api/payment/webhook/route.ts`):
   1. optional source-IP allow-list (Paystack's 3 published IPs);
   2. **HMAC-SHA512 of the raw body** with your secret key vs `x-paystack-signature`, constant-time compare; **no key configured ⇒ everything rejected**;
   3. takes only the `reference`, then **calls Paystack's verify API** and checks amount + currency against the server-side `payments` row (a forged/altered body can't grant anything);
   4. idempotent: row lock + `status='pending'` guard, so Paystack retries or replays are harmless;
   5. returns 5xx on internal failure so Paystack retries; 2xx only after success.
4. Test in Test mode: post a job, pay with a Paystack test card, watch the job go `open`. Then confirm the endpoint rejects strangers:
   ```bash
   curl -i -X POST https://app.example.com/api/payment/webhook -d '{"event":"charge.success"}'
   # expect: 401 Invalid signature (or 403 if the IP allow-list is on)
   ```
5. Going live: swap to `sk_live_…`, set the **Live** webhook URL, redeploy.

## 6. Scheduled housekeeping (every minute)

The app needs a tick for: releasing unengaged 15-minute claims, notification retention (read → 1 day, unread → 2 months), booking reminders (3 days / 1 day / day-of), suspending lapsed company plans, and cleanup.

Dokploy → `repair-web` → **Schedules** → add:
- Cron: `* * * * *`
- Shell: `sh`
- Command:
  ```
  sh -c 'wget -qO- --post-data="" --header="x-cron-secret: $CRON_SECRET" http://127.0.0.1:3000/api/cron/tick'
  ```
If your Dokploy version has no Schedules tab, use host cron instead:
`* * * * * docker exec $(docker ps -qf name=repair-web) sh -c 'wget -qO- --post-data="" --header="x-cron-secret: $CRON_SECRET" http://127.0.0.1:3000/api/cron/tick'`

## 7. Post-deploy checklist

- [ ] `https://app.example.com` loads over HTTPS; HTTP redirects to HTTPS.
- [ ] Register a worker with a photo → image shows on the dashboard (proves app → MinIO).
- [ ] `nc -zv <VPS-IP> 5432` and `nc -zv <VPS-IP> 9000` **fail** from your laptop (DB and raw MinIO port not exposed).
- [ ] Webhook `curl` above returns 401/403.
- [ ] Cron tick returns JSON (`curl -X POST -H "x-cron-secret: …" https://app.example.com/api/cron/tick` — works from outside too).
- [ ] Postgres backup ran once and you can see it in the destination.
- [ ] `repair_app` role in use (`SELECT current_user;` via the app's DATABASE_URL), owner only in `MIGRATION_DATABASE_URL`.
- [ ] Rotate any key that was ever committed or shared (see SECURITY.md).

## 8. Operating notes

- **Updates:** push to the branch → Dokploy redeploys; migrations run automatically. Add new schema as `db/migrations/002_*.sql` (never edit an applied file).
- **Single instance:** the in-memory rate limiter assumes one app replica (right for one VPS). If you scale to >1 replica, move limits to Redis/Postgres.
- **Pin versions:** pin `minio/minio` to a dated `RELEASE.*` tag and keep `postgres:16`; test upgrades on a copy.
- **Restore drill:** restore a backup into a scratch Postgres at least once before you need it.
