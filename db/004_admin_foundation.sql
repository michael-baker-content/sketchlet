CREATE TABLE IF NOT EXISTS sketchlet_admin_oauth (
  state_hash text PRIMARY KEY,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sketchlet_admin_oauth_expiry_idx ON sketchlet_admin_oauth(expires_at);
CREATE TABLE IF NOT EXISTS sketchlet_admin_sessions (
  token_hash text PRIMARY KEY,
  github_id text NOT NULL,
  github_login text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sketchlet_admin_sessions_expiry_idx ON sketchlet_admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS sketchlet_admin_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_github_id text NOT NULL,
  actor_login text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  private_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sketchlet_admin_actions_recent_idx ON sketchlet_admin_actions(created_at DESC, id DESC);
-- Separate publication state from the daily submission constraint.
-- No moderation writes are exposed until public visibility checks are implemented.
CREATE TABLE IF NOT EXISTS sketchlet_drawing_moderation (
  drawing_id uuid PRIMARY KEY REFERENCES sketchlet_drawings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'public' CHECK (status IN ('public', 'hidden', 'pending')),
  public_reason text NOT NULL DEFAULT '',
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
