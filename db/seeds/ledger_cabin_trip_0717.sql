-- One-time insert of 20 manual expenses dated 2026-07-17. All posted, all
-- budget-flagged. Appended to the ledger tail with fresh seq values and a
-- running checkbook balance extended from the current last row. Guarded so a
-- re-run is a no-op.

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
    WHERE user_id = uid AND date = DATE '2026-07-17'
      AND description = 'Recreation.gov - Mesa Verde tour fees'
  ) THEN
    RAISE NOTICE '2026-07-17 transactions already imported; skipping';
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
         r.description, DATE '2026-07-17', true, true,
         ROUND(base_balance + SUM(r.amount) OVER (ORDER BY r.ord), 2)
  FROM (VALUES
    (1,  'TRAVEL',      'Recreation.gov - Mesa Verde tour fees',            -40.00),
    (2,  'TRAVEL',      'Maverik: water',                                    -3.99),
    (3,  'TRAVEL',      'Maverik: snacks to cabin',                         -14.97),
    (4,  'TRAVEL',      'Maverik: gas to cabin',                            -46.93),
    (5,  'GAS',         'Shell: gas in Denver to Cabin',                    -36.59),
    (6,  'GROCERIES',   'Trader Joe''s: groceries to cabin',                -96.57),
    (7,  'HOUSE',       'Home Depot: fungicide for lawn and around butterfly gardent no mushrooms', -4.25),
    (8,  'HOUSE',       'Home Depot: spray foam',                            -4.80),
    (9,  'GROCERIES',   'King Soopers; groceries to cabin',                -186.71),
    (10, 'RESTAURANT',  'LSU Varsity Inn',                                  -50.96),
    (11, 'HOUSE',       'Big tool box: sprinkler drip line head.',          -14.00),
    (12, 'GIFTS',       'Amazon: keyboard for Dick',                        -24.85),
    (13, 'TAKEOUT',     'Chipotle dinner',                                  -57.00),
    (14, 'GROCERIES',   'King Soopers: groceries',                          -55.17),
    (15, 'HOUSE',       'Home Depot: Wasp killing',                         -33.15),
    (16, 'TRAVEL',      'Parking Telluride',                                 -6.00),
    (17, 'RESTAURANT',  'Casa Bonita: 3 of 4 -  398.98 -300 = 98.98',      -100.00),
    (18, 'KIDS SPORTS', 'Stella Dance Recital Video',                       -42.63),
    (19, 'DOGS',        'Chewy: Gabapentin',                                -26.55),
    (20, 'TAKEOUT',     'Venmo to Kara Harris: food for pool party after finals', -50.00)
  ) AS r(ord, category, description, amount);
END $$;
