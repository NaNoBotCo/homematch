-- 0003_worker — worker profiles and their multi-valued attributes.
-- Directory-first (§7): these tables are the Phase 0 product; a browsable,
-- filterable directory is useful at 10 workers with no booking flow.

CREATE TABLE worker_profile (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES app_user(id),
  operator_id       TEXT NOT NULL REFERENCES operator(id),
  headline_category TEXT,                  -- category key; headline chosen from labels, never free text (§5)
  about_en          TEXT NOT NULL DEFAULT '',
  about_th          TEXT NOT NULL DEFAULT '',
  years_experience  INTEGER,
  live_in_possible  INTEGER NOT NULL DEFAULT 0,
  availability_json TEXT NOT NULL DEFAULT '{}',  -- weekly grid
  verification_tier TEXT NOT NULL DEFAULT 'T0',  -- T0|T1|T2|T3 (shape+label in UI, never colour-only)
  license_number    TEXT,                  -- only for requires_license categories (§5 title guard)
  certificate_note  TEXT,                  -- massage/other cert (§5)
  -- Honest, COMPUTED response-time bucket (§7.2); null until data exists.
  reply_bucket      TEXT,                  -- 'within_hour'|'within_day'|'few_days'|'slow'|null
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wp_operator ON worker_profile(operator_id, active);
CREATE INDEX idx_wp_user ON worker_profile(user_id);

CREATE TABLE worker_category (
  worker_id    TEXT NOT NULL REFERENCES worker_profile(id),
  operator_id  TEXT NOT NULL REFERENCES operator(id),
  category_key TEXT NOT NULL,
  PRIMARY KEY (worker_id, category_key)
);
CREATE INDEX idx_wc_cat ON worker_category(operator_id, category_key);

CREATE TABLE worker_zone (
  worker_id   TEXT NOT NULL REFERENCES worker_profile(id),
  operator_id TEXT NOT NULL REFERENCES operator(id),
  zone_key    TEXT NOT NULL,
  PRIMARY KEY (worker_id, zone_key)
);
CREATE INDEX idx_wz_zone ON worker_zone(operator_id, zone_key);

CREATE TABLE worker_language (
  worker_id   TEXT NOT NULL REFERENCES worker_profile(id),
  operator_id TEXT NOT NULL REFERENCES operator(id),
  lang        TEXT NOT NULL,               -- 'th'|'en'|'my'|'shan'|...
  PRIMARY KEY (worker_id, lang)
);

CREATE TABLE worker_engagement (
  worker_id       TEXT NOT NULL REFERENCES worker_profile(id),
  operator_id     TEXT NOT NULL REFERENCES operator(id),
  engagement_type TEXT NOT NULL,           -- 'task'|'short'|'long'
  PRIMARY KEY (worker_id, engagement_type)
);

-- Rate card: one row per category the worker serves (§6). unit is an enum;
-- negotiable is the flag that powers the negotiation-first posture.
CREATE TABLE rate_card (
  id           TEXT PRIMARY KEY,
  worker_id    TEXT NOT NULL REFERENCES worker_profile(id),
  operator_id  TEXT NOT NULL REFERENCES operator(id),
  category_key TEXT NOT NULL,
  amount       INTEGER,                    -- minor unit not needed for THB; whole baht
  unit         TEXT NOT NULL,              -- 'hour'|'visit'|'day'|'month'
  negotiable   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_rate_worker ON rate_card(worker_id);

CREATE TABLE worker_photo (
  id          TEXT PRIMARY KEY,
  worker_id   TEXT NOT NULL REFERENCES worker_profile(id),
  operator_id TEXT NOT NULL REFERENCES operator(id),
  r2_key      TEXT NOT NULL,               -- object key in R2; never publicly listable
  sort        INTEGER NOT NULL DEFAULT 0
);
