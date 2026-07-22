-- 0001_core — operators (tenants), users, sessions, OTP challenges.
-- D1 is SQLite; this file applies verbatim under node:sqlite in tests.
-- Every tenant-scoped table carries operator_id and is covered by the
-- cross-tenant isolation suite (test/tenant_isolation.test.mjs).

CREATE TABLE operator (
  id           TEXT PRIMARY KEY,          -- stable slug, e.g. 'chiangmai'
  hostname     TEXT NOT NULL UNIQUE,      -- routing key: request host → operator
  brand_name   TEXT NOT NULL,
  config_json  TEXT NOT NULL,             -- full tenant config snapshot (see tenants/*.json)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE app_user (
  id             TEXT PRIMARY KEY,
  operator_id    TEXT NOT NULL REFERENCES operator(id),
  phone          TEXT,                    -- E.164; null for un-claimed admin-assisted stubs
  phone_verified INTEGER NOT NULL DEFAULT 0,  -- T0
  display_name   TEXT NOT NULL,
  is_customer    INTEGER NOT NULL DEFAULT 0,
  is_worker      INTEGER NOT NULL DEFAULT 0,
  is_admin       INTEGER NOT NULL DEFAULT 0,  -- operator-admin
  -- admin-assisted profiles are created un-claimed; the worker claims the
  -- account later by OTP against claim_phone. §7.1
  claimed        INTEGER NOT NULL DEFAULT 1,
  claim_phone    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (operator_id, phone)
);
CREATE INDEX idx_user_operator ON app_user(operator_id);

CREATE TABLE session (
  id          TEXT PRIMARY KEY,           -- random token; also the signed cookie value
  user_id     TEXT NOT NULL REFERENCES app_user(id),
  operator_id TEXT NOT NULL REFERENCES operator(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_session_user ON session(user_id);

-- Short-lived OTP challenges for phone verification (T0) and account claim.
CREATE TABLE otp_challenge (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator(id),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,             -- never store the raw code
  purpose     TEXT NOT NULL,             -- 'verify' | 'claim' | 'login'
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_phone ON otp_challenge(operator_id, phone);
