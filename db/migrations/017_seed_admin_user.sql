-- 017_seed_admin_user.sql
-- Seeds the primary admin account so subsequent data migrations (e.g. the ledger
-- import in 019) have an owner. Idempotent: re-running leaves the existing user
-- untouched.
--
-- The password hash is deliberately NOT committed -- pass it in at run time.
-- Generate one (bcryptjs, cost 12) and run this migration with:
--
--   HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" 'your-password')
--   psql "$DATABASE_URL" -v admin_password_hash="$HASH" -f db/migrations/017_seed_admin_user.sql
--
-- The email below stays literal because migrations 019/026/027 and the db/seeds
-- files look the admin up by this exact address.

\if :{?admin_password_hash}
\else
\echo '>>> ERROR: admin_password_hash is not set.'
\echo '>>> Re-run with: psql "$DATABASE_URL" -v admin_password_hash=<bcrypt-hash> -f db/migrations/017_seed_admin_user.sql'
\quit
\endif

INSERT INTO users (email, password_hash, role)
VALUES (
  'peter.tardif@gmail.com',
  :'admin_password_hash',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
