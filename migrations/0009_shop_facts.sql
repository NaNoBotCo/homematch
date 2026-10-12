-- 0009_shop_facts — what a business states about its own service: prices,
-- areas served, how to book, languages. Each fact carries the business's own
-- words, the page it came from and the date read (JSON array in `facts`).
-- `source` says where the row came from: 'motdang' (a Mot Dang record, `url`
-- is its motdang.net page) or 'web' (found on the business's own pages, `url`
-- is that page). Filled by scripts/import-shops.py from data/businesses.json.

ALTER TABLE shop ADD COLUMN source TEXT NOT NULL DEFAULT 'motdang';
ALTER TABLE shop ADD COLUMN facts TEXT;
ALTER TABLE shop ADD COLUMN website TEXT;
