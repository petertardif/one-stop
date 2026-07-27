-- 022_debts.sql
-- Standalone debts ledger for the /debts page. Mirrors the transactions ledger
-- (own seq + running balance) but split by `term` (short|long) with a per-term
-- running balance. `paid_at` set = the row has been "Marked as Paid" and moves to
-- the Paid Off tab, where its balance is frozen at the value it had when paid.
CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq BIGINT,                       -- ledger order within (user, term)
  date DATE NOT NULL,
  category TEXT,
  description TEXT,
  amount NUMERIC(14, 2) NOT NULL,   -- signed: + credit (green), - debit (red)
  balance NUMERIC(14, 2),           -- per-term running balance; frozen once paid
  term TEXT NOT NULL CHECK (term IN ('short', 'long')),
  paid_at TIMESTAMPTZ,              -- NULL = active, set = Paid Off
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX debts_user_term_seq ON debts (user_id, term, seq);
CREATE INDEX debts_user_paid ON debts (user_id, paid_at);
