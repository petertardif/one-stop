-- Import 57 one-off short-term debts that are already paid off. Each is a debt
-- account (term=short, paid_at set, uncategorized) with a single balance snapshot
-- equal to the amount paid, dated today. Guarded by a sentinel name for re-runs.

DO $$
DECLARE
  uid uuid;
  rec record;
  new_id uuid;
  d date := CURRENT_DATE;
BEGIN
  SELECT id INTO uid FROM users WHERE email = 'peter.tardif@gmail.com';
  IF uid IS NULL THEN RAISE EXCEPTION 'admin user not found'; END IF;

  IF EXISTS (SELECT 1 FROM debt_accounts WHERE user_id = uid AND name = 'Gaskill School Fees Paid Lenny') THEN
    RAISE NOTICE 'short paid debts already imported; skipping';
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      (9,  'Gaskill School Fees Paid Lenny', 136.59),
      (10, 'Jordan Grape Vs', 229.51),
      (11, 'Senske', 62.29),
      (12, 'Companion Animal Veterinary: Rudy', 154.23),
      (13, 'Pete Car Registration', 276.32),
      (14, 'Ticketmaster Rockies Cubs game', 268.50),
      (15, 'Sports Excellence: Tanner''s Skates', 213.74),
      (16, 'Chase Annual Membership Fee', 69),
      (17, 'Fantasy Football Entry fees 125 Pete, Melissa, Lenny, Paige, and Cameron', 125),
      (18, 'Almohados: pillows for anniversary', 150),
      (19, 'Venmo: Car parts for GMC Power Steering pump, line, and filter', 250),
      (20, 'Restorative Injectibles', 250),
      (21, 'Venmo: Trampoline', 625),
      (22, 'Home Depot: Rubber Mulch - Pay back savings', 179.50),
      (23, 'Venmo: Trampoline', 625),
      (24, 'JBF Fall clothes sale for kids', 443.70),
      (25, 'Restorative Injectibles', 292),
      (26, 'Restorative Injectibles', 266),
      (27, 'Avalanche Game for Tanner', 348.60),
      (28, 'VRBO: Keystone January 23-27', 964.88),
      (29, 'United Flight', 496.96),
      (30, 'Boiler Repair', 350),
      (31, 'Chimney Cleaning and Mortar repair', 759),
      (32, 'Expedia: Rental Car for Phoenix', 323.75),
      (33, 'Phoenix March 24 - Hotel', 1395.76),
      (34, 'NOPSI', 909.51),
      (35, 'NOPSI', 487.28),
      (36, 'Noah Kahan concert tickets', 414),
      (37, 'Flights to Phoenix', 760),
      (38, 'Flights to Chicago for Tanner''s tournament - Going', 408.80),
      (39, 'Flights to Chicago for Tanner''s tournament - Returning', 71.20),
      (40, 'Flights for Palumbo Bachelor to Philly', 186.39),
      (41, 'Colorado United: Fall and Spring Soccer', 640),
      (42, 'Lennox Flag Football Fall 2025', 85),
      (43, 'ACC Sports Camp', 558),
      (44, 'Arapahoe Hockey Team fees for tourneys', 375),
      (45, 'Stella - Jazz class', 143),
      (46, 'Lennox - Fall Guitar', 240),
      (47, 'Arapahoe Hockey - Registration fee', 520),
      (48, 'Arapahoe Hockey - Payment 2', 372.30),
      (49, 'Arapahoe Hockey - Advanced fee', 137.70),
      (50, 'Arapahoe Hockey - USA Hockey fee', 61),
      (51, 'Learn to Skate Level 4 - Tanner', 86),
      (52, 'Lennox - Winter Basketball', 115),
      (53, 'Arapahoe Summer Hockey League', 275),
      (54, 'Arapaho Basketball Camp', 163.80),
      (55, 'Spring Travel Hockey Payment 2', 375),
      (56, 'Spring Travel Hockey', 979.20),
      (57, 'Stella Ballet 1 w/recital', 258),
      (58, 'Lennox - Spring Guitar', 240),
      (59, 'Car rental Chicago Trip', 332.31),
      (60, 'SSPRD: Waveriders start and turns clinic', 115),
      (61, 'Warriors 8U Graduate Program', 433.50),
      (62, 'Lennox - Spring Guitar', 240),
      (63, 'Lennox - Spring Flag Football', 85),
      (64, 'Tanner - Sharpen em Up Session 1', 96.90),
      (65, 'Tanner - Sharpen em Up Session 2', 96.90)
    ) AS t(ord, name, amount)
  LOOP
    INSERT INTO debt_accounts (user_id, name, category, term, sort_order, paid_at)
    VALUES (uid, rec.name, NULL, 'short', rec.ord, NOW())
    RETURNING id INTO new_id;

    INSERT INTO debt_snapshots (debt_account_id, as_of, balance)
    VALUES (new_id, d, rec.amount);
  END LOOP;
END $$;
