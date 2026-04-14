CREATE TABLE user_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name     TEXT,
  last_name      TEXT,
  date_of_birth  DATE,
  phone          TEXT,
  address_line1  TEXT,
  address_line2  TEXT,
  city           TEXT,
  state          TEXT,
  postal_code    TEXT,
  country        TEXT NOT NULL DEFAULT 'US',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
