-- 0008_shops — businesses from the Mot Dang directory that do the board's
-- work: cleaning services, landscapers, laundries that pick up and deliver,
-- home-repair shops. Imported from mot-dang's records by
-- scripts/import-shops.py; each row links to its own motdang.net page.

CREATE TABLE shop (
  id          TEXT NOT NULL,                 -- the motdang record id
  operator_id TEXT NOT NULL REFERENCES operator(id),
  category    TEXT NOT NULL,                 -- board category key
  name_th     TEXT,
  name_en     TEXT,
  url         TEXT NOT NULL,                 -- its motdang.net page
  lat         REAL,
  lon         REAL,
  phone       TEXT,
  line_url    TEXT,
  hours       TEXT,
  zone        TEXT,                          -- nearest board zone within 12 km
  pickup      INTEGER NOT NULL DEFAULT 0,    -- laundry: says it picks up and delivers
  province    TEXT,
  rank        REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (operator_id, category, id)
);
CREATE INDEX idx_shop_cat ON shop(operator_id, category, rank);
