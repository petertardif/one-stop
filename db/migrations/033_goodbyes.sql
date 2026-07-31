-- 033_goodbyes.sql
-- "In Case I Die" > Goodbyes: death-triggered messages the admin/partner_admin
-- leaves for their partner + dependents. Delivery is pull-based (messages become
-- visible on the Goodbyes page once due). Video/audio/photos are external links
-- (no object storage). One shared death event anchors all release schedules.

-- Single global death event. `died_at` NULL until a recipient confirms the death
-- (set to the confirm-click time); admin can reset it to NULL. The `singleton`
-- column + UNIQUE + CHECK guarantees exactly one row.
CREATE TABLE death_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton),
  died_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO death_event (singleton) VALUES (TRUE);

-- Authored messages. Each targets EITHER a role (everyone/partner/dependent/
-- partner_admin) OR a specific user (audience_user_id) — enforced by the CHECK.
--   kind:        main | letter | video | audio | gallery | open_when
--   release_mode immediate | offset (offset_amount + offset_unit after death)
--                | date (release_date) | milestone (milestone_label, recipient
--                self-opens) | recurring_annual (release_date's month/day).
--   body:        text for letter/main; media_url: external link for video/audio.
CREATE TABLE goodbye_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'letter', 'video', 'audio', 'gallery', 'open_when')),
  audience_role TEXT CHECK (audience_role IN ('everyone', 'partner', 'dependent', 'partner_admin')),
  audience_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT,
  media_url TEXT,
  release_mode TEXT NOT NULL DEFAULT 'immediate'
    CHECK (release_mode IN ('immediate', 'offset', 'date', 'milestone', 'recurring_annual')),
  offset_amount INT,
  offset_unit TEXT CHECK (offset_unit IN ('days', 'months', 'years')),
  release_date DATE,
  milestone_label TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT goodbye_audience_one CHECK (num_nonnulls(audience_role, audience_user_id) = 1)
);
CREATE INDEX goodbye_messages_author ON goodbye_messages (author_id);
CREATE INDEX goodbye_messages_audience_role ON goodbye_messages (audience_role);
CREATE INDEX goodbye_messages_audience_user ON goodbye_messages (audience_user_id);

-- Photos for a gallery-kind message (external image links + captions).
CREATE TABLE goodbye_gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES goodbye_messages(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX goodbye_gallery_images_message ON goodbye_gallery_images (message_id);
