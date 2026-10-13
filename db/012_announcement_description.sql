ALTER TABLE sketchlet_announcements
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''
  CHECK (length(description) <= 240);
