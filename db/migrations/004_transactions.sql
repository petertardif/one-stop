CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  plaid_transaction_id TEXT UNIQUE,
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  amount NUMERIC(14, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT,
  description TEXT,
  check_number TEXT,
  date DATE NOT NULL,
  is_posted BOOLEAN NOT NULL DEFAULT TRUE,
  budget_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transactions_user_date ON transactions (user_id, date DESC);
CREATE INDEX transactions_account ON transactions (account_id);
