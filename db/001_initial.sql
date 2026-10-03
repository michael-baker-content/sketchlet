CREATE TABLE IF NOT EXISTS sketchlet_prompts (
  day date PRIMARY KEY,
  title text NOT NULL
);
CREATE TABLE IF NOT EXISTS sketchlet_drawings (
  id uuid PRIMARY KEY,
  prompt_day date NOT NULL REFERENCES sketchlet_prompts(day),
  owner_hash text NOT NULL,
  object_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_hash, prompt_day)
);
CREATE TABLE IF NOT EXISTS sketchlet_votes (
  drawing_id uuid NOT NULL REFERENCES sketchlet_drawings(id) ON DELETE CASCADE,
  voter_hash text NOT NULL,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drawing_id, voter_hash)
);
CREATE INDEX IF NOT EXISTS sketchlet_drawings_prompt_idx ON sketchlet_drawings (prompt_day, created_at);
