-- RE-PAIR schema. Money is stored as integer KOBO (1 NGN = 100 kobo) so there
-- is never any floating-point rounding. Every table has constraints so bad
-- data is rejected by the database even if application validation is bypassed.

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role           text NOT NULL CHECK (role IN ('worker','customer')),
  customer_kind  text CHECK (customer_kind IN ('individual','company')),
  full_name      text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  company_name   text CHECK (company_name IS NULL OR char_length(company_name) BETWEEN 2 AND 120),
  email          text NOT NULL CHECK (char_length(email) <= 254),
  phone          text NOT NULL CHECK (phone ~ '^\+[0-9]{10,15}$'),
  address        text NOT NULL CHECK (char_length(address) BETWEEN 5 AND 300),
  area_id        text NOT NULL,
  place_id       text,
  lat            double precision CHECK (lat BETWEEN -90 AND 90),
  lng            double precision CHECK (lng BETWEEN -180 AND 180),
  avatar_key     text,
  services       text[] NOT NULL DEFAULT '{}',
  points         integer NOT NULL DEFAULT 0,              -- customer trust points
  password_hash  text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  failed_logins  integer NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'customer') = (customer_kind IS NOT NULL)),
  CHECK (role <> 'worker' OR avatar_key IS NOT NULL),      -- workers must have a profile picture
  CHECK (customer_kind IS DISTINCT FROM 'company' OR company_name IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX users_phone_uq ON users (phone);
CREATE INDEX users_worker_area_idx ON users (area_id) WHERE role = 'worker';

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,                         -- sha256 of the cookie value; raw token is never stored
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  last_seen   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE businesses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL UNIQUE REFERENCES users(id),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description        text CHECK (description IS NULL OR char_length(description) <= 1000),
  area_id            text NOT NULL,
  declared_headcount integer NOT NULL CHECK (declared_headcount BETWEEN 1 AND 100000),
  monthly_fee_kobo   integer NOT NULL CHECK (monthly_fee_kobo >= 0),
  plan_paid_until    timestamptz,
  status             text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','active','suspended')),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX businesses_name_uq ON businesses (lower(name));

-- A worker belongs to at most one company at a time (PK on user_id).
CREATE TABLE company_members (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  joined_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_members_business_idx ON company_members (business_id);

CREATE TABLE company_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  worker_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by    uuid NOT NULL REFERENCES users(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','denied','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz
);
CREATE UNIQUE INDEX company_invitations_pending_uq ON company_invitations (business_id, worker_id) WHERE status = 'pending';
CREATE INDEX company_invitations_worker_idx ON company_invitations (worker_id, status);

-- Customer companies can designate other registered users as admins who may act for them.
CREATE TABLE customer_company_admins (
  company_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, admin_user_id)
);

CREATE TABLE jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES users(id),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description      text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  service_id       text NOT NULL,
  keywords         text[] NOT NULL DEFAULT '{}',
  area_id          text NOT NULL,
  address          text NOT NULL CHECK (char_length(address) BETWEEN 5 AND 300),
  lat              double precision CHECK (lat BETWEEN -90 AND 90),
  lng              double precision CHECK (lng BETWEEN -180 AND 180),
  is_express       boolean NOT NULL DEFAULT false,
  timeline         text CHECK (timeline IS NULL OR char_length(timeline) <= 200),
  requirements     text CHECK (requirements IS NULL OR char_length(requirements) <= 1000),
  status           text NOT NULL DEFAULT 'pending_payment'
                   CHECK (status IN ('pending_payment','open','claimed','engaged','in_progress','completed','cancelled')),
  fee_kobo         integer NOT NULL,
  visible_at       timestamptz,                              -- when it appears on the board
  worker_id        uuid REFERENCES users(id),
  business_id      uuid REFERENCES businesses(id),
  claimed_at       timestamptz,
  engage_deadline  timestamptz,
  engaged_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_express OR timeline IS NOT NULL)
);
CREATE INDEX jobs_board_idx ON jobs (visible_at DESC) WHERE status = 'open';
CREATE INDEX jobs_customer_idx ON jobs (customer_id, created_at DESC);
CREATE INDEX jobs_worker_idx ON jobs (worker_id, status);
CREATE INDEX jobs_claim_expiry_idx ON jobs (engage_deadline) WHERE status = 'claimed';

CREATE TABLE job_events (
  id         bigserial PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id),
  type       text NOT NULL,
  detail     text CHECK (detail IS NULL OR char_length(detail) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job_idx ON job_events (job_id);

CREATE TABLE ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,  -- one rating per job
  rater_id     uuid NOT NULL REFERENCES users(id),
  worker_id    uuid NOT NULL REFERENCES users(id),
  business_id  uuid REFERENCES businesses(id),
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment      text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ratings_worker_idx ON ratings (worker_id, created_at);
CREATE INDEX ratings_business_idx ON ratings (business_id, created_at) WHERE business_id IS NOT NULL;

-- Points a company earns from rated jobs. They expire after 7 days.
CREATE TABLE point_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  job_id       uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  amount       integer NOT NULL CHECK (amount > 0),
  remaining    integer NOT NULL CHECK (remaining >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CHECK (remaining <= amount)
);
CREATE INDEX point_grants_live_idx ON point_grants (business_id, expires_at) WHERE remaining > 0;

CREATE TABLE point_awards (
  id           bigserial PRIMARY KEY,
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  worker_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_by   uuid NOT NULL REFERENCES users(id),
  amount       integer NOT NULL CHECK (amount > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX point_awards_worker_idx ON point_awards (worker_id, created_at);

CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES users(id),
  business_id   uuid NOT NULL REFERENCES businesses(id),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description   text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  frequency     text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  start_date    date NOT NULL,
  end_date      date,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','denied','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX bookings_customer_idx ON bookings (customer_id);
CREATE INDEX bookings_business_idx ON bookings (business_id);

CREATE TABLE booking_reminders (
  booking_id       uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  occurrence_date  date NOT NULL,
  offset_days      smallint NOT NULL CHECK (offset_days IN (0,1,3)),
  PRIMARY KEY (booking_id, occurrence_date, offset_days)   -- guarantees each reminder is sent once
);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES users(id),
  kind          text NOT NULL CHECK (kind IN ('job_fee','business_skip_fee','business_plan')),
  amount_kobo   integer NOT NULL CHECK (amount_kobo > 0),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  subject_id    uuid,                                        -- job id or business id
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz,
  consumed_at   timestamptz                                  -- skip-fee is single use
);
CREATE INDEX payments_user_idx ON payments (user_id, kind, status);

CREATE TABLE location_requests (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL CHECK (char_length(email) <= 254),
  created_at  timestamptz NOT NULL DEFAULT now()
);
