-- 026_auto_services.sql
-- Vehicle service/maintenance log for the /auto page (under Financials). One row
-- per service event: date, car, description, cost (always positive), who performed
-- it. `sort_order` is a persisted manual drag order (mirrors budget_items). No
-- running balance. Filtered in-app by car (multiselect), year (multiselect), search.

CREATE TABLE auto_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  car TEXT NOT NULL,
  description TEXT,
  cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  performed_by TEXT,
  sort_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auto_services_user_sort ON auto_services (user_id, sort_order);
CREATE INDEX auto_services_user_car ON auto_services (user_id, car);

-- Seed the admin's existing service history. Costs stored positive (ABS). Manual
-- order (sort_order) is newest date first. Skips cleanly if the admin is absent.
INSERT INTO auto_services (user_id, date, car, description, cost, performed_by, sort_order)
SELECT u.id, s.date, s.car, s.description, s.cost, s.performed_by,
       ROW_NUMBER() OVER (ORDER BY s.date DESC)
FROM users u
CROSS JOIN (VALUES
  ('2020-11-14'::date, 'GMC Acadia',    'Oil Change',                                                        86.23,  'Grease Monkey'),
  ('2021-04-25'::date, 'Subaru Legacy', 'New tires',                                                         657.08, 'Discount Tire'),
  ('2021-05-24'::date, 'GMC Acadia',    'Registation',                                                       278.20, 'DMV'),
  ('2021-05-28'::date, 'GMC Acadia',    'Oil Change',                                                        77.60,  'Grease Monkey'),
  ('2021-06-04'::date, 'Subaru Legacy', 'New Battery',                                                       129.59, 'Pete'),
  ('2021-09-01'::date, 'GMC Acadia',    'ACDelco Vapor Canister Purge Solenoid',                             470.39, 'Extreme Auto Repair'),
  ('2021-10-08'::date, 'GMC Acadia',    'Oil Change',                                                        92.82,  'Grease Monkey'),
  ('2022-10-13'::date, 'GMC Acadia',    'New tires',                                                         898.04, 'Discount Tire'),
  ('2022-10-12'::date, 'Subaru Legacy', 'Replacement front headlights',                                      59.39,  'Pete'),
  ('2023-02-14'::date, 'Subaru Legacy', 'Spark plug wires/spark plugs/oil change',                           875.04, 'InC Auto Repair Center'),
  ('2023-05-16'::date, 'GMC Acadia',    'Registation',                                                       267.17, 'DMV'),
  ('2023-06-30'::date, 'GMC Acadia',    'Oil Change',                                                        58.55,  'Raceway Lube Plus'),
  ('2024-06-24'::date, 'GMC Acadia',    'Oil Change',                                                        59.95,  'Raceway Lube Plus'),
  ('2024-06-14'::date, 'GMC Acadia',    'Registation',                                                       271.75, 'DMV'),
  ('2024-06-28'::date, 'GMC Acadia',    'Diagnostic on AC',                                                  221.18, 'Eagle Automotive Service'),
  ('2024-07-12'::date, 'GMC Acadia',    'AC Evac and recharge',                                              409.21, 'Service Street'),
  ('2024-12-27'::date, 'GMC Acadia',    'Oil Change',                                                        59.95,  'Raceway Lube Plus'),
  ('2024-12-28'::date, 'GMC Acadia',    'New Tires',                                                         959.20, 'Discount Tire'),
  ('2025-02-12'::date, 'GMC Acadia',    'Wheel bearing and hub assembly replacement',                        494.48, 'Raceway Lube Plus'),
  ('2025-06-02'::date, 'GMC Acadia',    'Registation',                                                       224.48, 'DMV'),
  ('2025-06-13'::date, 'GMC Acadia',    'Venmo: Car parts for GMC Power Steering pump, line, oil, and oil filter', 250.00, 'Jimmy Krueger and Peter Tardif'),
  ('2025-07-22'::date, 'Subaru Legacy', 'Subaru emissions test',                                             25.50,  'Air Care Colorado: Pete''s car'),
  ('2025-08-01'::date, 'Subaru Legacy', 'Centennial Violation for Unregistered Car',                         100.00, 'Centennial City Government'),
  ('2025-07-02'::date, 'GMC Acadia',    'Parking Ticket Telluride',                                          53.00,  'Telluride City Council'),
  ('2025-08-01'::date, 'Subaru Legacy', 'Registation x 2 years',                                             276.32, 'DMV'),
  ('2026-01-22'::date, 'GMC Acadia',    'New Battery',                                                       225.10, 'Pete'),
  ('2026-01-23'::date, 'GMC Acadia',    'Oil Change and fitlers',                                            140.78, 'Raceway Lube Plus'),
  ('2026-01-24'::date, 'GMC Acadia',    'Tire Rotation',                                                     0.00,   'Discount Tire')
) AS s(date, car, description, cost, performed_by)
WHERE u.email = 'peter.tardif@gmail.com';
