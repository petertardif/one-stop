-- Liquidate = archive for investments. NULL = Active, set = Liquidated tab.
ALTER TABLE investments ADD COLUMN liquidated_at TIMESTAMPTZ;
CREATE INDEX investments_user_liquidated ON investments (user_id, liquidated_at);
