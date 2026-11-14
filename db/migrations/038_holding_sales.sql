-- Sell flow for Holdings (see 037_holdings.sql). A sale closes lots oldest-first
-- (FIFO); when it only partly covers a lot, the API splits that lot into an open
-- remainder and a sold piece. Open lots have sold_on NULL. Replaces the
-- placeholder sold_at column, which was never written.
ALTER TABLE holding_lots DROP COLUMN sold_at;
ALTER TABLE holding_lots ADD COLUMN sold_on DATE;
ALTER TABLE holding_lots ADD COLUMN sale_price NUMERIC(14,4) CHECK (sale_price >= 0);
ALTER TABLE holding_lots ADD CONSTRAINT holding_lots_sale_chk
  CHECK ((sold_on IS NULL) = (sale_price IS NULL));
