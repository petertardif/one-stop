-- Two-parent model: either parent (admin or partner_admin) can be the deceased,
-- and a confirmer may mark BOTH as having passed. Record who the death event is
-- for as a set of user ids (1 or 2). No array FK is available; ids are validated
-- in the API against users with role admin|partner_admin.
ALTER TABLE death_event
  ADD COLUMN IF NOT EXISTS deceased_user_ids UUID[];
