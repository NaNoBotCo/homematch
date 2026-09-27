-- 0005_listing — self-listing. A worker lists themselves with a form, the
-- operator approves it, and the worker keeps a private edit link (a random
-- token shown once; only its hash is stored). Contact fields here are the ones
-- the worker typed for their public page, separate from app_user.phone.

ALTER TABLE worker_profile ADD COLUMN status TEXT NOT NULL DEFAULT 'live'; -- 'pending'|'live'|'hidden'
ALTER TABLE worker_profile ADD COLUMN contact_line TEXT;
ALTER TABLE worker_profile ADD COLUMN contact_phone TEXT;
ALTER TABLE worker_profile ADD COLUMN indexable INTEGER NOT NULL DEFAULT 0;  -- search engines may index the page
ALTER TABLE worker_profile ADD COLUMN edit_hash TEXT;                        -- sha256(edit token)
ALTER TABLE worker_profile ADD COLUMN consent_at TEXT;
CREATE INDEX idx_wp_edit ON worker_profile(edit_hash);

-- One row per form submission, for a per-address daily cap. ip_hash is
-- salted with SESSION_SECRET; the address itself is not stored.
CREATE TABLE listing_attempt (
  operator_id TEXT NOT NULL REFERENCES operator(id),
  ip_hash     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attempt ON listing_attempt(operator_id, ip_hash, created_at);
