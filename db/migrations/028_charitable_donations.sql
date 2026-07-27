-- Charitable Donations — a flat log of donations the family gives, for tax records.
-- No running balance; costs are plain amounts. Admin read/write, others read-only.

CREATE TABLE charitable_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  organization TEXT,                          -- recipient charity / organization
  donor_name TEXT,                            -- the family member who gave
  donor_contact TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,    -- donation amount (positive)
  payment_method TEXT NOT NULL DEFAULT 'cash' -- cash | non_cash
    CHECK (payment_method IN ('cash', 'non_cash')),
  goods_services_value NUMERIC(14,2),         -- value of goods/services received back (quid pro quo)
  notes TEXT,
  sort_order INT,                             -- manual default order (newest first via date on ties)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX charitable_donations_user_sort ON charitable_donations (user_id, sort_order);
CREATE INDEX charitable_donations_user_date ON charitable_donations (user_id, date DESC);
