CREATE TABLE stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  sector TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE watchlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  sticker_price NUMERIC(14,2),
  mos_price NUMERIC(14,2),
  growth_rate_used NUMERIC(6,4),
  big5_data JSONB,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, stock_id)
);

CREATE TABLE four_ms_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_entry_id UUID NOT NULL REFERENCES watchlist_entries(id) ON DELETE CASCADE UNIQUE,
  meaning_notes TEXT,
  moat_type TEXT CHECK (moat_type IN ('brand','switching','toll','cost','secret')),
  moat_notes TEXT,
  management_notes TEXT,
  mos_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE research_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_entry_id UUID NOT NULL REFERENCES watchlist_entries(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE too_hard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  reason TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
