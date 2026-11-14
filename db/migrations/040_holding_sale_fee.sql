-- Sale fee/commission on sold Holdings lots. One sale can close several lots; the
-- API splits the sale fee across them by shares (to the cent, the remainder going
-- to the last lot). Proceeds = shares x sale_price - sale_fee. Reset to 0 on undo.
ALTER TABLE holding_lots ADD COLUMN sale_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sale_fee >= 0);
