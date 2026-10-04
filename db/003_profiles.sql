CREATE TABLE IF NOT EXISTS sketchlet_profiles (
  owner_hash text PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) <= 32),
  updated_at timestamptz NOT NULL DEFAULT now()
);
