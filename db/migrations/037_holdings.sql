-- Holdings: equities currently owned, entered by hand (Ally Invest has no usable
-- API/Plaid feed). One row per purchase lot; the Holdings page aggregates lots by
-- ticker (total shares, weighted average cost). sold_at is reserved for a future
-- sell flow; open lots have it NULL.
CREATE TABLE holding_lots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  company_name TEXT NOT NULL,
  shares       NUMERIC(18,6) NOT NULL CHECK (shares > 0),
  price        NUMERIC(14,4) NOT NULL CHECK (price >= 0),
  bought_on    DATE NOT NULL,
  notes        TEXT,
  sold_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX holding_lots_user_ticker_idx ON holding_lots (user_id, ticker);
