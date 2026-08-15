-- Add a "Paid With" payment account to debts, mirroring `transactions.budget_account`
-- (see 032_budget_account.sql): N/A (null) | Bank | Chase CC | BoA CC. Shown as an
-- editable column on the Short Term and Paid Off tabs; Long Term debts do not carry
-- one, so the API nulls it whenever a debt's term is 'long' and such a debt reads as
-- N/A once it lands on the Paid Off tab.
--
-- No backfill: existing debts start at N/A (null), which is the intended default for
-- new debts too.

ALTER TABLE debt_accounts
  ADD COLUMN paid_with TEXT
  CHECK (paid_with IS NULL OR paid_with IN ('bank', 'chase_cc', 'boa_cc'));
