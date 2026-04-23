-- Expand invite_tokens role constraint to include partner_admin
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'invite_tokens'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  LOOP
    EXECUTE 'ALTER TABLE invite_tokens DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE invite_tokens
  ADD CONSTRAINT invite_tokens_role_check
  CHECK (role IN ('admin', 'partner_admin', 'partner', 'dependent'));
