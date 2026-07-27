-- 020_budget_items.sql
-- Budget line items for the /budget page. Each item is a recurring bill entered
-- at a native cadence (annual|monthly|biweekly|weekly) with a single `amount`.
-- Derived in the app: Annual = amount × {annual:1, monthly:12, biweekly:26,
-- weekly:52}; Next Monthly = Annual ÷ 12. `due_date` is informational text only.
-- Soft-archive via `archived_at` (Active/Archived views + restore).
--
-- `transactions.budget_item_id` links a transaction created by "Add to Ledger"
-- back to its source bill, so the same bill can't be posted twice in one month.

CREATE TABLE budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_date TEXT,
  pay_type TEXT NOT NULL DEFAULT 'manual' CHECK (pay_type IN ('autopay', 'manual')),
  duration TEXT NOT NULL CHECK (duration IN ('annual', 'monthly', 'biweekly', 'weekly')),
  amount NUMERIC(14, 2) NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX budget_items_user ON budget_items (user_id, archived_at);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS budget_item_id UUID REFERENCES budget_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS transactions_budget_item ON transactions (budget_item_id);
