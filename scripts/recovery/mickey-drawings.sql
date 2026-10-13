DO $$
DECLARE
  source_id uuid := 'ac54ec3e-6b7e-4318-b40f-642c9220e7a9';
  destination_id uuid := 'a0eb1287-f95a-43e4-959b-c2ad1876a34b';
  drawing_ids uuid[] := ARRAY['64e77019-727b-40e7-b09d-e75d33f30319','99b35c57-043a-43f6-87c1-4c94f33ea54b']::uuid[];
  source_owner text;
  destination_owner text;
  lock_key bigint;
  moved integer;
BEGIN
  SELECT owner_hash INTO source_owner FROM sketchlet_accounts
    WHERE id=source_id AND clerk_instance='obliging-gnat-2630.clerk.accounts.dev';
  SELECT owner_hash INTO destination_owner FROM sketchlet_accounts
    WHERE id=destination_id AND clerk_instance='clerk.sketchlet.app';
  IF source_owner IS NULL OR destination_owner IS NULL OR source_owner=destination_owner THEN
    RAISE EXCEPTION 'Recovery stopped: expected source and destination accounts were not found.';
  END IF;
  -- Use the same lock order as account linking and the identity write guards.
  FOR lock_key IN SELECT DISTINCT value FROM unnest(ARRAY[hashtextextended(source_owner,0),hashtextextended(destination_owner,0)]) value ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(lock_key);
  END LOOP;
  PERFORM id FROM sketchlet_accounts WHERE id IN (source_id,destination_id) ORDER BY id FOR UPDATE;
  PERFORM id FROM sketchlet_drawings WHERE id=ANY(drawing_ids) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM sketchlet_guest_links WHERE guest_hash IN (source_owner,destination_owner)) THEN
    RAISE EXCEPTION 'Recovery stopped: an account identity has been retired. Review its ownership before retrying.';
  END IF;
  IF (SELECT count(*) FROM sketchlet_drawings WHERE id=ANY(drawing_ids) AND owner_hash IN (source_owner,destination_owner)
    AND ((id=drawing_ids[1] AND prompt_day='2026-10-12'::date) OR (id=drawing_ids[2] AND prompt_day='2026-10-02'::date)))<>2 THEN
    RAISE EXCEPTION 'Recovery stopped: a drawing is missing, has changed date, or belongs to another account.';
  END IF;
  IF EXISTS(SELECT 1 FROM sketchlet_link_conflicts WHERE drawing_id=ANY(drawing_ids)) THEN
    RAISE EXCEPTION 'Recovery stopped: a drawing has an account-linking exclusion that needs review.';
  END IF;
  IF EXISTS(SELECT 1 FROM sketchlet_drawings incoming JOIN sketchlet_drawings existing
    ON existing.owner_hash=destination_owner AND existing.prompt_day=incoming.prompt_day AND existing.id<>incoming.id
    WHERE incoming.id=ANY(drawing_ids)) THEN
    RAISE EXCEPTION 'Recovery stopped: Michael Baker now has another drawing on one of these dates. Nothing was moved; choose which to keep first.';
  END IF;
  WITH changed AS (
    UPDATE sketchlet_drawings SET owner_hash=destination_owner
      WHERE id=ANY(drawing_ids) AND owner_hash=source_owner RETURNING id
  )
  INSERT INTO sketchlet_admin_actions(actor_github_id,actor_login,action,target_type,target_id,before_state,after_state,private_note)
    SELECT 'local-maintenance','local recovery script','drawing_account_recovered','drawing',id::text,
      jsonb_build_object('account_id',source_id),jsonb_build_object('account_id',destination_id),
      'Site-owner-authorized recovery of two drawings from the mickey development account to the Michael Baker production account.'
    FROM changed;
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved>0 THEN
    DELETE FROM sketchlet_votes WHERE drawing_id=ANY(drawing_ids) AND voter_hash IN (source_owner,destination_owner);
  END IF;
END;
$$;
