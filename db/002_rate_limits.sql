CREATE TABLE IF NOT EXISTS sketchlet_rate_limits (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL
);
