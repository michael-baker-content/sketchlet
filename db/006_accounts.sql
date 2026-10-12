-- Account foundation only. Existing guest ownership is deliberately untouched.
CREATE TABLE IF NOT EXISTS sketchlet_accounts (
  id uuid PRIMARY KEY,
  clerk_instance text NOT NULL,
  clerk_user_id text NOT NULL,
  owner_hash text NOT NULL UNIQUE CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_instance, clerk_user_id)
);
