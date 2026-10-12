-- 0010_payments — a payment Mot Dang confirmed from the payer's bank slip
-- (SlipOK). One row per slip: trans_ref is the bank's own reference, unique, so a
-- slip pays once. token_hash is what the payer's browser holds to show it has
-- paid (the token itself is never stored). expires_at ends what a payment opens
-- (an agreement, a month of subscription); NULL for an invoice paid once.
CREATE TABLE payment (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator(id),
  kind        TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  booking     INTEGER,
  trans_ref   TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT,
  UNIQUE (operator_id, trans_ref)
);
CREATE INDEX payment_token ON payment(operator_id, token_hash);
