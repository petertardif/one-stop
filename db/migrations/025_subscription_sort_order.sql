-- 025_subscription_sort_order.sql
-- Adds a persisted manual display order to subscriptions so the /subscriptions
-- Active tab can be reordered by drag-and-drop (mirrors budget_items.sort_order).
-- Backfills existing rows by created_at; new rows append to the end.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sort_order INT;

UPDATE subscriptions s SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
  FROM subscriptions
) sub
WHERE s.id = sub.id AND s.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS subscriptions_user_sort ON subscriptions (user_id, sort_order);
