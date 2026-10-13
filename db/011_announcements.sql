CREATE TABLE IF NOT EXISTS sketchlet_announcements (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','scheduled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS sketchlet_announcements_public_idx ON sketchlet_announcements(published_at DESC,id DESC) WHERE status IN ('published','scheduled');
