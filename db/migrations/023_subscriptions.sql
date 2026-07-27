-- 023_subscriptions.sql
-- Subscriptions ledger for the /subscriptions page. Two views (Active / Cancelled)
-- via `cancelled_at` (NULL = active, set = Cancelled tab). Prices are entered
-- manually per cadence (year/month, both nullable). Renewal is structured:
-- renewal_cycle 'monthly' → renewal_day (1–31, renders "Monthly - Nth");
-- renewal_cycle 'annual'  → renewal_date (a specific date).
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT,
  service TEXT NOT NULL,
  company TEXT,
  price_per_year NUMERIC(14, 2),
  price_per_month NUMERIC(14, 2),
  renewal_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (renewal_cycle IN ('monthly', 'annual')),
  renewal_day INT CHECK (renewal_day BETWEEN 1 AND 31),
  renewal_date DATE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX subscriptions_user_cancelled ON subscriptions (user_id, cancelled_at);
