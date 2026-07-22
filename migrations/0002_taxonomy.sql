-- 0002_taxonomy — service categories and service-area zones.
-- Taxonomy is DATA, not code (§5): adding a category is a row + i18n strings.
-- Labels live in the i18n tables keyed by `label_key`, never as columns here,
-- so a category renders in every locale without schema change.

CREATE TABLE service_category (
  operator_id      TEXT NOT NULL REFERENCES operator(id),
  key              TEXT NOT NULL,          -- stable, e.g. 'caregiver'
  label_key        TEXT NOT NULL,          -- i18n key, e.g. 'cat.caregiver'
  sort             INTEGER NOT NULL DEFAULT 0,
  -- Title guard (§5): a licensed category (e.g. nurse) requires a license
  -- number on the profile and displays it. Default categories are 0.
  requires_license INTEGER NOT NULL DEFAULT 0,
  -- Optional practitioner-certificate field (massage pattern, §5).
  wants_certificate INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (operator_id, key)
);

CREATE TABLE zone (
  operator_id TEXT NOT NULL REFERENCES operator(id),
  key         TEXT NOT NULL,               -- e.g. 'old-city'
  label_key   TEXT NOT NULL,               -- i18n key, e.g. 'zone.old-city'
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (operator_id, key)
);
