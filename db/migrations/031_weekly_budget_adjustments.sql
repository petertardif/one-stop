-- Per-week top-ups to the $1,000 weekly allowance. Each row raises a given
-- Fri→Thu week's budget by `amount` (positive adds headroom; negative reduces).
-- These affect ONLY the 1K weekly balance — never the checkbook `balance`
-- column, and they are not ledger transactions. `week_start` is the Friday that
-- begins the week, matching the ledger's window-function week key.

CREATE TABLE weekly_budget_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX weekly_budget_adjustments_user_week
  ON weekly_budget_adjustments (user_id, week_start);
