-- Split the boolean budget flag into a per-transaction budget ACCOUNT. The
-- Budget column in the ledger becomes a dropdown: N/A (null) | Bank | Chase CC
-- | BoA CC. `budget_flagged` is retained as "is this in the weekly budget (any
-- account)" and kept in sync (= budget_account IS NOT NULL) by the API on every
-- write; it still powers the remaining card + the 1K Weekly Balance column
-- (all three accounts). Only the "1k Budget Spent" card filters to chase_cc.
--
-- Backfill is lossless: every currently-flagged row becomes 'chase_cc'
-- (flagged=true stays true); unflagged rows stay N/A (null, flagged=false).

ALTER TABLE transactions
  ADD COLUMN budget_account TEXT
  CHECK (budget_account IS NULL OR budget_account IN ('bank', 'chase_cc', 'boa_cc'));

UPDATE transactions
  SET budget_account = 'chase_cc'
  WHERE budget_flagged = true AND budget_account IS NULL;
