-- 0006_events — what the approval bot and the forms did, for the operator's
-- digest. One row per event. `detail` is JSON (reasons, model label). The
-- digest reads rows after the last one it reported.

CREATE TABLE listing_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id TEXT NOT NULL REFERENCES operator(id),
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  kind        TEXT NOT NULL,   -- approve|hold|edit-approve|edit-hold|remove|honeypot|cross-site|rate-limit|admin-fail|admin-approve|admin-hide|admin-delete|model-error
  worker_id   TEXT,            -- no FK: the listing may be deleted later
  ip_hash     TEXT,
  name        TEXT,            -- display name at the time, for the digest
  detail      TEXT
);
CREATE INDEX idx_event_op ON listing_event(operator_id, id);

-- Last digest of each kind per operator: 'scheduled' (daily) and
-- 'interim' (sent between, when something needs a look).
CREATE TABLE digest_state (
  operator_id   TEXT NOT NULL REFERENCES operator(id),
  kind          TEXT NOT NULL,
  last_event_id INTEGER NOT NULL DEFAULT 0,
  sent_at       TEXT,
  PRIMARY KEY (operator_id, kind)
);

-- Photos of the work. A photo that shows a person is refused before it is
-- stored, so every row here passed the check; 'held' ones carry text or a
-- QR code and wait for the operator.
ALTER TABLE worker_photo ADD COLUMN status TEXT NOT NULL DEFAULT 'live';  -- 'live'|'held'
ALTER TABLE worker_photo ADD COLUMN mime TEXT NOT NULL DEFAULT 'image/jpeg';
ALTER TABLE worker_photo ADD COLUMN what TEXT;                            -- the model's five words
ALTER TABLE worker_photo ADD COLUMN created_at TEXT;
