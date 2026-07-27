-- 024_budget_item_sort_order.sql
-- Adds a persisted manual display order to budget line items so the /budget page
-- can be reordered by drag-and-drop. Backfills existing rows by created_at.
-- New items append to the end (max + 1). GET orders by sort_order, and the
-- /api/budget-items/reorder endpoint rewrites it on each drag.
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS sort_order INT;

UPDATE budget_items b SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
  FROM budget_items
) sub
WHERE b.id = sub.id AND b.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS budget_items_user_sort ON budget_items (user_id, sort_order);
