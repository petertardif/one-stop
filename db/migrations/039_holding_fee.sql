-- Purchase fee/commission per Holdings lot. Counted in the lot's cost basis
-- (shares x price + fee). When a sale splits a lot, the fee is divided between the
-- open remainder and the sold piece in proportion to their shares.
ALTER TABLE holding_lots ADD COLUMN fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee >= 0);
