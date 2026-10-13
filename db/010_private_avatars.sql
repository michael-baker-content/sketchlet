-- Account-only decoration. Never join this key into public drawing responses.
ALTER TABLE sketchlet_accounts ADD COLUMN IF NOT EXISTS avatar_key text;
