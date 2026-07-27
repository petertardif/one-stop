-- One-off import of the family's historical debt balances into the redesigned
-- snapshot model. Idempotent-ish: skips if any debt_accounts already exist for
-- the admin user. Categories/terms approved by the user; every cell (incl. the
-- one blank) stored as a real balance; debts whose latest balance is 0 are Paid.

DO $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM users WHERE email = 'peter.tardif@gmail.com';
  IF uid IS NULL THEN RAISE EXCEPTION 'admin user not found'; END IF;

  IF EXISTS (SELECT 1 FROM debt_accounts WHERE user_id = uid) THEN
    RAISE NOTICE 'debt_accounts already present for user; skipping import';
    RETURN;
  END IF;

  INSERT INTO debt_accounts (user_id, name, category, term, sort_order, paid_at) VALUES
    (uid, 'Peter Federal Student Loan',      'STUDENT LOAN',  'long',  1, NOW()),
    (uid, 'Peter Discover Student Loan',     'STUDENT LOAN',  'long',  2, NOW()),
    (uid, 'Melissa Great Lakes S. Loan',     'STUDENT LOAN',  'long',  3, NULL),
    (uid, 'Car Loan',                        'CAR LOAN',      'long',  4, NOW()),
    (uid, 'Loan for home from Dick/Maryann', 'PERSONAL LOAN', 'long',  5, NOW()),
    (uid, 'Mortgage',                        'MORTGAGE',      'long',  6, NULL),
    (uid, 'Bank of America Credit Card',     'CREDIT CARD',   'short', 7, NULL),
    (uid, 'Chase Credit Card',               'CREDIT CARD',   'short', 8, NOW());

  INSERT INTO debt_snapshots (debt_account_id, as_of, balance)
  SELECT a.id, v.as_of::date, v.balance
  FROM debt_accounts a
  JOIN (VALUES
    ('Peter Federal Student Loan','2026-05-25',0),('Peter Federal Student Loan','2025-05-25',0),('Peter Federal Student Loan','2024-06-10',0),('Peter Federal Student Loan','2023-06-16',0),('Peter Federal Student Loan','2023-05-12',0),('Peter Federal Student Loan','2022-08-25',34216.11),('Peter Federal Student Loan','2021-04-01',34216.11),('Peter Federal Student Loan','2020-07-05',34216.11),('Peter Federal Student Loan','2019-08-18',36588.77),('Peter Federal Student Loan','2018-08-17',38226.80),('Peter Federal Student Loan','2016-05-16',40664.07),('Peter Federal Student Loan','2015-09-01',41468.91),
    ('Peter Discover Student Loan','2026-05-25',0),('Peter Discover Student Loan','2025-05-25',0),('Peter Discover Student Loan','2024-06-10',0),('Peter Discover Student Loan','2023-06-16',0),('Peter Discover Student Loan','2023-05-12',0),('Peter Discover Student Loan','2022-08-25',0),('Peter Discover Student Loan','2021-04-01',0),('Peter Discover Student Loan','2020-07-05',0),('Peter Discover Student Loan','2019-08-18',0),('Peter Discover Student Loan','2018-08-17',3117.01),('Peter Discover Student Loan','2016-05-16',4287.50),('Peter Discover Student Loan','2015-09-01',4649.48),
    ('Melissa Great Lakes S. Loan','2026-05-25',4757.18),('Melissa Great Lakes S. Loan','2025-05-25',5388.50),('Melissa Great Lakes S. Loan','2024-06-10',5733.74),('Melissa Great Lakes S. Loan','2023-06-16',10994.96),('Melissa Great Lakes S. Loan','2023-05-12',10994.96),('Melissa Great Lakes S. Loan','2022-08-25',10994.96),('Melissa Great Lakes S. Loan','2021-04-01',10994.96),('Melissa Great Lakes S. Loan','2020-07-05',10994.96),('Melissa Great Lakes S. Loan','2019-08-18',11911.14),('Melissa Great Lakes S. Loan','2018-08-17',12458.93),('Melissa Great Lakes S. Loan','2016-05-16',5909.64),('Melissa Great Lakes S. Loan','2015-09-01',6275.68),
    ('Car Loan','2026-05-25',0),('Car Loan','2025-05-25',0),('Car Loan','2024-06-10',0),('Car Loan','2023-06-16',0),('Car Loan','2023-05-12',0),('Car Loan','2022-08-25',12941.37),('Car Loan','2021-04-01',18471.96),('Car Loan','2020-07-05',21487.18),('Car Loan','2019-08-18',0),('Car Loan','2018-08-17',0),('Car Loan','2016-05-16',0),('Car Loan','2015-09-01',5641.93),
    ('Loan for home from Dick/Maryann','2026-05-25',0),('Loan for home from Dick/Maryann','2025-05-25',0),('Loan for home from Dick/Maryann','2024-06-10',0),('Loan for home from Dick/Maryann','2023-06-16',0),('Loan for home from Dick/Maryann','2023-05-12',0),('Loan for home from Dick/Maryann','2022-08-25',0),('Loan for home from Dick/Maryann','2021-04-01',0),('Loan for home from Dick/Maryann','2020-07-05',12000),('Loan for home from Dick/Maryann','2019-08-18',12000),('Loan for home from Dick/Maryann','2018-08-17',12000),('Loan for home from Dick/Maryann','2016-05-16',12000),('Loan for home from Dick/Maryann','2015-09-01',0),
    ('Mortgage','2026-05-25',472500),('Mortgage','2025-05-25',474368.03),('Mortgage','2024-06-10',479384.09),('Mortgage','2023-06-16',484100),('Mortgage','2023-05-12',335393.44),('Mortgage','2022-08-25',341274.76),('Mortgage','2021-04-01',350793.50),('Mortgage','2020-07-05',329527.87),('Mortgage','2019-08-18',345481.63),('Mortgage','2018-08-17',350000),('Mortgage','2016-05-16',360200),('Mortgage','2015-09-01',241085.44),
    ('Bank of America Credit Card','2026-05-25',2800),('Bank of America Credit Card','2025-05-25',0),('Bank of America Credit Card','2024-06-10',0),('Bank of America Credit Card','2023-06-16',0),('Bank of America Credit Card','2023-05-12',0),('Bank of America Credit Card','2022-08-25',0),('Bank of America Credit Card','2021-04-01',0),('Bank of America Credit Card','2020-07-05',0),('Bank of America Credit Card','2019-08-18',8596.92),('Bank of America Credit Card','2018-08-17',9007.43),('Bank of America Credit Card','2016-05-16',3825),('Bank of America Credit Card','2015-09-01',2658.01),
    ('Chase Credit Card','2026-05-25',0),('Chase Credit Card','2025-05-25',0),('Chase Credit Card','2024-06-10',846.29),('Chase Credit Card','2023-06-16',0),('Chase Credit Card','2023-05-12',0),('Chase Credit Card','2022-08-25',16230.73),('Chase Credit Card','2021-04-01',2000),('Chase Credit Card','2020-07-05',1300),('Chase Credit Card','2019-08-18',900),('Chase Credit Card','2018-08-17',0),('Chase Credit Card','2016-05-16',3000),('Chase Credit Card','2015-09-01',3146.06)
  ) AS v(name, as_of, balance) ON v.name = a.name
  WHERE a.user_id = uid;
END $$;
