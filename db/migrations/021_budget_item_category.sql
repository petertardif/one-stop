-- 021_budget_item_category.sql
-- Adds a free-form category tag to budget line items (Housing, Utilities, Debt,
-- etc.). This is a finer classification than the ledger's category set and stays
-- on budget_items only — "Add to Ledger" still posts transactions as MONTHLY BILLS.
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS category TEXT;
