ALTER TABLE too_hard_entries
  ADD COLUMN IF NOT EXISTS reanalyzed_at TIMESTAMPTZ;
