-- One-time insert of 12 manual expenses from the Telluride/cabin trip, dated
-- 2026-07-10. All posted, all budget-flagged. Appended to the ledger tail with
-- fresh seq values and a running checkbook balance extended from the current
-- last row. Guarded so a re-run is a no-op.

DO $$
DECLARE
  uid uuid;
  base_seq bigint;
  base_balance numeric(14,2);
BEGIN
  SELECT id INTO uid FROM users WHERE email = 'peter.tardif@gmail.com';
  IF uid IS NULL THEN RAISE EXCEPTION 'admin user not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE user_id = uid AND date = DATE '2026-07-10'
      AND description = 'Los Dos Potrillos: dinner after drive from cabin'
  ) THEN
    RAISE NOTICE 'Telluride trip transactions already imported; skipping';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(seq), 0) INTO base_seq FROM transactions WHERE user_id = uid;
  SELECT COALESCE(balance, 0) INTO base_balance
  FROM transactions WHERE user_id = uid
  ORDER BY seq DESC NULLS LAST, created_at DESC
  LIMIT 1;

  INSERT INTO transactions
    (user_id, account_id, is_manual, seq, amount, type, category, description,
     date, is_posted, budget_flagged, balance)
  SELECT uid, NULL, true, base_seq + r.ord, r.amount, 'expense', r.category,
         r.description, DATE '2026-07-10', true, true,
         ROUND(base_balance + SUM(r.amount) OVER (ORDER BY r.ord), 2)
  FROM (VALUES
    (1,  'RESTAURANT', 'Los Dos Potrillos: dinner after drive from cabin', -96.18),
    (2,  'GAS',        'Maverick: gas on way home from cabin',             -55.97),
    (3,  'TRAVEL',     'Mountain Peak Gift: sunglasses for Tanner in Telluride', -18.60),
    (4,  'HOUSE',      'Ace hardware Telluride: Lenny lures and Stella toy', -19.00),
    (5,  'TRAVEL',     'The Market at Telluride: Groceries',               -46.66),
    (6,  'TRAVEL',     'Maverick: gum and water',                          -11.13),
    (7,  'TRAVEL',     'Dreamcatchers: 4 corners',                         -10.50),
    (8,  'TRAVEL',     'Four Corners Monument Admission',                  -20.00),
    (9,  'TRAVEL',     'Maverick: Snacks and drinks',                       -7.95),
    (10, 'TRAVEL',     'Maverik: Gas in Cortez',                           -64.54),
    (11, 'TRAVEL',     'Mesa Verde Museum Store: Ornament',                -16.00),
    (12, 'TRAVEL',     'Mesa Verda National Park entrance fee',            -30.00)
  ) AS r(ord, category, description, amount);
END $$;
