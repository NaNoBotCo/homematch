-- 0004_verification — verification records with PDPA data-minimization (§6).
-- T1 = government ID sighted by operator-admin. We store ONLY the assertion
-- ("verified against Thai ID/passport, name matched") + a hash, never the
-- document itself; the uploaded doc is purged from R2 after admin review.

CREATE TABLE verification_record (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES app_user(id),
  operator_id   TEXT NOT NULL REFERENCES operator(id),
  tier          TEXT NOT NULL,             -- 'T1'|'T2'|'T3'
  method        TEXT NOT NULL,             -- 'thai_id'|'passport'|'references'|'contract'|'background_check'
  evidence_note TEXT NOT NULL,             -- human note, no PII beyond the assertion
  doc_hash      TEXT,                      -- salted hash of the sighted doc id; doc itself purged
  name_matched  INTEGER NOT NULL DEFAULT 0,
  verified_by   TEXT REFERENCES app_user(id),  -- the operator-admin
  verified_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ver_user ON verification_record(user_id);
