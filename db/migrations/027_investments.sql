-- 027_investments.sql
-- Investments tracker for /investing/investments. One row per investment account
-- (`investments`) plus a normalized time series of dated balance snapshots
-- (`investment_snapshots`). Snapshots let us add new valuation dates forever and
-- power the portfolio-over-time / per-account-growth / allocation charts.
-- Admin read/write; partner/dependent read-only (per investing visibility).

CREATE TABLE investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brokerage TEXT NOT NULL,
  type TEXT,                              -- Retirement | College | Savings (free-form)
  owner TEXT,                             -- "in whose name" (free-form)
  type_description TEXT,                  -- Pension | 401 K | Roth IRA | 529 | etc.
  contribution_cadence TEXT NOT NULL DEFAULT 'none'
    CHECK (contribution_cadence IN ('none', 'weekly', 'biweekly', 'monthly', 'annual')),
  contribution_amount NUMERIC(14, 2),     -- native-cadence amount (nullable)
  contribution_note TEXT,                 -- e.g. "8% matched 4% ($167.69)"
  strategy TEXT,
  sort_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE investment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  as_of DATE NOT NULL,
  value NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (investment_id, as_of)
);

CREATE INDEX investments_user_sort ON investments (user_id, sort_order);
CREATE INDEX investment_snapshots_inv ON investment_snapshots (investment_id, as_of);

-- Seed the admin's accounts + their historical balance snapshots. Year-only
-- entries (2022) are stored as Jan 1 of that year. Blank cells are omitted.
WITH ins AS (
  INSERT INTO investments
    (user_id, brokerage, type, owner, type_description, contribution_cadence, contribution_amount, contribution_note, strategy, sort_order)
  SELECT u.id, v.brokerage, v.type, v.owner, v.type_description, v.cadence, v.amount, v.note, v.strategy, v.n
  FROM users u
  CROSS JOIN (VALUES
    (1,  'PERA',                                       'Retirement', 'Peter',   'Pension',              'none',     NULL::numeric, NULL, 'CASHED OUT put into 6818 S Elizabeth St.'),
    (2,  'PERA',                                       'Retirement', 'Melissa', 'Pension',              'monthly',  700.36, NULL, NULL),
    (3,  'Security Benefits',                          'Retirement', 'Melissa', '403b',                 'none',     NULL,   NULL, NULL),
    (4,  'Fidelity Investment',                        'Retirement', 'Peter',   '401 K',                'biweekly', 335.38, '8% matched 4% ($167.69)', NULL),
    (5,  'Security Benefits',                          'Retirement', 'Peter',   'Roth IRA',             'monthly',  100,    NULL, NULL),
    (6,  'Security Benefits (Kids College Fund)',      'College',    'Melissa', 'Roth IRA',             'monthly',  100,    NULL, NULL),
    (7,  'College Invest - Colorado Scholars Choice',  'College',    'Peter',   'College 529 Plan',     'monthly',  50,     NULL, NULL),
    (8,  'College Invest - Vanguard',                  'College',    'Peter',   'College 529 Plan',     'monthly',  50,     NULL, NULL),
    (9,  'Lennox''s College Funds (Wells)',            'College',    'Lennox',  'Savings Account',      'monthly',  33,     NULL, NULL),
    (10, 'Tanner''s College Funds (Wells)',            'College',    'Tanner',  'Savings Account',      'monthly',  34,     NULL, NULL),
    (11, 'Stella''s College Funds (Wells)',            'College',    'Stella',  'Savings Account',      'monthly',  33,     NULL, NULL),
    (12, 'Ally Bank',                                  'Savings',    'Joint',   'Online Savings Account','none',    NULL,   NULL, NULL),
    (13, 'RainyDay Fund (Wells)',                      'Savings',    'Joint',   'Savings Account',      'monthly',  300,    NULL, NULL),
    (14, 'Ally Invest',                                'Retirement', 'Joint',   'Equities',             'monthly',  50,     NULL,
         E'1. continue to invest in SP500 EFT\n2. move $3000 from savings into the Vanguard Real Estate\n3. determine how to split up this pie better to diversify\n4. Increase monthly buying up to $25 when Mortgage Refi goes through and payment lowers.')
  ) AS v(n, brokerage, type, owner, type_description, cadence, amount, note, strategy)
  WHERE u.email = 'peter.tardif@gmail.com'
  RETURNING id, sort_order
)
INSERT INTO investment_snapshots (investment_id, as_of, value)
SELECT ins.id, s.as_of, s.value
FROM ins
JOIN (VALUES
  (1,  '2025-05-28'::date, 0.00),     (1,  '2025-02-01'::date, 0.00),     (1,  '2022-01-01'::date, 92000.00), (1,  '2021-04-27'::date, 70000.00),
  (2,  '2026-04-21'::date, 71821.90), (2,  '2025-05-28'::date, 62417.02), (2,  '2025-02-01'::date, 59036.26), (2,  '2022-01-01'::date, 42000.00), (2,  '2021-04-27'::date, 35000.00),
  (3,  '2026-04-21'::date, 12984.00), (3,  '2025-02-01'::date, 11392.36), (3,  '2022-01-01'::date, 10132.42), (3,  '2021-04-27'::date, 9930.12),
  (4,  '2026-04-21'::date, 75183.18), (4,  '2025-05-28'::date, 51846.34), (4,  '2025-02-01'::date, 46926.89), (4,  '2022-01-01'::date, 5870.94),  (4,  '2021-04-27'::date, 809.49),
  (5,  '2026-04-21'::date, 22117.40), (5,  '2025-05-28'::date, 17857.96), (5,  '2025-02-01'::date, 17906.84), (5,  '2022-01-01'::date, 11365.28), (5,  '2021-04-27'::date, 10571.05),
  (6,  '2026-04-21'::date, 22116.45), (6,  '2025-05-28'::date, 17857.20), (6,  '2025-02-01'::date, 17906.24), (6,  '2022-01-01'::date, 11363.98), (6,  '2021-04-27'::date, 10569.79),
  (7,  '2026-04-21'::date, 10480.06), (7,  '2025-05-28'::date, 8634.49),  (7,  '2025-02-01'::date, 8365.01),  (7,  '2022-01-01'::date, 5330.92),  (7,  '2021-04-27'::date, 4990.81),
  (8,  '2026-04-21'::date, 333.53),
  (9,  '2026-04-21'::date, 1672.00),  (9,  '2025-05-28'::date, 2308.87),  (9,  '2025-02-01'::date, 2209.84),  (9,  '2022-01-01'::date, 1005.11),  (9,  '2021-04-27'::date, 707.05),
  (10, '2026-04-21'::date, 1648.26),  (10, '2025-05-28'::date, 2390.92),  (10, '2025-02-01'::date, 2288.88),  (10, '2022-01-01'::date, 1031.21),  (10, '2021-04-27'::date, 757.16),
  (11, '2026-04-21'::date, 1618.29),  (11, '2025-05-28'::date, 2475.16),  (11, '2025-02-01'::date, 2376.12),  (11, '2022-01-01'::date, 1064.30),  (11, '2021-04-27'::date, 766.25),
  (12, '2026-04-21'::date, 4777.65),  (12, '2025-05-28'::date, 7587.41),  (12, '2025-02-01'::date, 10120.17), (12, '2022-01-01'::date, 10004.42), (12, '2021-04-27'::date, 10004.42),
  (13, '2026-04-21'::date, 3598.93),  (13, '2025-05-28'::date, 4034.92),  (13, '2025-02-01'::date, 5226.84),  (13, '2022-01-01'::date, 12915.76), (13, '2021-04-27'::date, 10426.94),
  (14, '2026-04-21'::date, 4255.65),  (14, '2025-05-28'::date, 3727.61),  (14, '2025-02-01'::date, 3636.79),  (14, '2022-01-01'::date, 1257.19),  (14, '2021-04-27'::date, 889.02)
) AS s(n, as_of, value) ON s.n = ins.sort_order;
