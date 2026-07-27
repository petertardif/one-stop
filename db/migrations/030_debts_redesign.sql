-- Redesign /debts from the running-balance ledger into a snapshot/history model,
-- mirroring investments + investment_snapshots. A debt is now a parent account
-- (name, category, term, paid flag) with a normalized dated balance series.
-- The old `debts` ledger table was empty (verified 0 rows) so it is replaced.

DROP TABLE IF EXISTS debts CASCADE;

CREATE TABLE debt_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,                                   -- free-form debt taxonomy
  term TEXT NOT NULL DEFAULT 'long' CHECK (term IN ('short', 'long')),
  sort_order INT,                                  -- persisted manual drag order
  paid_at TIMESTAMPTZ,                             -- set = Paid Off tab (nothing owed)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX debt_accounts_user_sort ON debt_accounts (user_id, sort_order);
CREATE INDEX debt_accounts_user_paid ON debt_accounts (user_id, paid_at);

CREATE TABLE debt_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_account_id UUID NOT NULL REFERENCES debt_accounts(id) ON DELETE CASCADE,
  as_of DATE NOT NULL,
  balance NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (debt_account_id, as_of)
);
CREATE INDEX debt_snapshots_account_date ON debt_snapshots (debt_account_id, as_of DESC);
