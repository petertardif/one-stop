-- 018_transaction_seq_balance.sql
-- Adds ledger ordering + stored running balance to transactions.
--   seq     - preserves original checkbook/spreadsheet order (imported history),
--             and orders new manual entries (assigned max(seq)+1 on insert).
--   balance - the running checkbook balance AFTER this transaction, stored so the
--             Monthly ledger never recomputes it from a filtered subset. Maintained
--             incrementally by the API on create/update/delete.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS seq BIGINT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2);
CREATE INDEX IF NOT EXISTS transactions_user_seq ON transactions (user_id, seq DESC);
