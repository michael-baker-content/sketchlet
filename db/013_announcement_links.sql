CREATE OR REPLACE FUNCTION sketchlet_announcement_slug(post_title text, post_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(trim(both '-' from left(regexp_replace(lower(post_title), '[^a-z0-9]+', '-', 'g'), 60)), ''), 'announcement')
    || '~' || translate(rtrim(encode(uuid_send(post_id), 'base64'), '='), '+/', '-_');
$$;

ALTER TABLE sketchlet_announcements ADD COLUMN IF NOT EXISTS slug text;
UPDATE sketchlet_announcements SET slug=sketchlet_announcement_slug(title,id) WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sketchlet_announcements_slug_idx ON sketchlet_announcements(slug);
