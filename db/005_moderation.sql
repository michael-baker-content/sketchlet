-- One visibility rule for every public drawing query.
CREATE OR REPLACE VIEW sketchlet_public_drawings AS
SELECT d.* FROM sketchlet_drawings d
WHERE NOT EXISTS (SELECT 1 FROM sketchlet_drawing_moderation m
  WHERE m.drawing_id=d.id AND m.status<>'public');

CREATE TABLE IF NOT EXISTS sketchlet_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  drawing_id uuid NOT NULL REFERENCES sketchlet_drawings(id) ON DELETE CASCADE,
  reporter_hash text NOT NULL,
  category text NOT NULL CHECK (category IN ('sexual','hate','violence','harassment','personal','spam','other')),
  explanation text NOT NULL DEFAULT '' CHECK (char_length(explanation)<=1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  UNIQUE(drawing_id,reporter_hash)
);
CREATE INDEX IF NOT EXISTS sketchlet_reports_review_idx ON sketchlet_reports(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS sketchlet_reports_drawing_idx ON sketchlet_reports(drawing_id);
