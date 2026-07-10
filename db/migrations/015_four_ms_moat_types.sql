ALTER TABLE four_ms_entries
  ADD COLUMN IF NOT EXISTS moat_types JSONB NOT NULL DEFAULT '[]';

UPDATE four_ms_entries
  SET moat_types = CASE
    WHEN moat_type IS NOT NULL THEN jsonb_build_array(moat_type)
    ELSE '[]'
  END;
