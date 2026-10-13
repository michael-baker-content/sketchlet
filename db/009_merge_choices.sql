-- Keep merge exclusions separate from moderation and available for future curation.
ALTER TABLE sketchlet_link_conflicts ADD COLUMN IF NOT EXISTS selected_drawing_id uuid REFERENCES sketchlet_drawings(id);
ALTER TABLE sketchlet_link_conflicts ADD COLUMN IF NOT EXISTS source_owner_hash text;
CREATE INDEX IF NOT EXISTS sketchlet_link_conflicts_account_idx ON sketchlet_link_conflicts(account_id);
CREATE OR REPLACE FUNCTION sketchlet_guest_plan(account_key uuid, guest text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'date',d.prompt_day::text,'prompt',p.title,
    'conflict',existing.id IS NOT NULL,
    'existingId',existing.id,
    'image',CASE WHEN EXISTS(SELECT 1 FROM sketchlet_public_drawings visible WHERE visible.id=d.id) THEN '/api/drawings/'||d.id||'/image' ELSE NULL END,
    'existingImage',CASE WHEN EXISTS(SELECT 1 FROM sketchlet_public_drawings visible WHERE visible.id=existing.id) THEN '/api/drawings/'||existing.id||'/image' ELSE NULL END) ORDER BY d.prompt_day DESC),'[]'::jsonb)
  FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
  CROSS JOIN sketchlet_accounts a
  LEFT JOIN sketchlet_drawings existing ON existing.owner_hash=a.owner_hash AND existing.prompt_day=d.prompt_day
  WHERE a.id=account_key AND d.owner_hash=guest
  AND NOT EXISTS(SELECT 1 FROM sketchlet_link_conflicts c WHERE c.drawing_id=d.id);
$$;

CREATE OR REPLACE FUNCTION sketchlet_link_guest(account_key uuid, guest text, expected text, choices jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE account_owner text; claim sketchlet_guest_links%ROWTYPE; plan jsonb; linked integer; hidden integer; lock_key bigint;
BEGIN
  SELECT owner_hash INTO STRICT account_owner FROM sketchlet_accounts WHERE id=account_key;
  IF guest=account_owner OR guest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid guest identity';
  END IF;
  -- Consistent ordering prevents two link operations taking these in reverse.
  FOR lock_key IN SELECT DISTINCT value FROM unnest(ARRAY[hashtextextended(guest,0),hashtextextended(account_owner,0)]) value ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(lock_key);
  END LOOP;
  SELECT * INTO claim FROM sketchlet_guest_links WHERE guest_hash=guest;
  IF FOUND THEN
    IF claim.account_id<>account_key THEN RETURN jsonb_build_object('error','claimed'); END IF;
    RETURN jsonb_build_object('linked',claim.linked_count,'hidden',claim.hidden_count,'alreadyLinked',true);
  END IF;
  plan := sketchlet_guest_plan(account_key,guest);
  IF md5(plan::text) IS DISTINCT FROM expected THEN RETURN jsonb_build_object('error','changed'); END IF;
  -- Require exactly one valid choice per conflict; never silently pick a winner.
  IF choices IS NULL OR jsonb_typeof(choices)<>'object' THEN RETURN jsonb_build_object('error','choices'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(choices)) <> (SELECT count(*) FROM jsonb_array_elements(plan) item WHERE (item->>'conflict')::boolean)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(plan) item WHERE (item->>'conflict')::boolean
      AND (choices->>(item->>'id') IS NULL OR choices->>(item->>'id') NOT IN (item->>'id',item->>'existingId'))) THEN
    RETURN jsonb_build_object('error','choices');
  END IF;
  INSERT INTO sketchlet_link_conflicts(drawing_id,account_id,reason,selected_drawing_id,source_owner_hash)
    SELECT CASE WHEN choices->>(item->>'id')=item->>'id' THEN (item->>'existingId')::uuid ELSE (item->>'id')::uuid END,
      account_key,'not selected during account merge',(choices->>(item->>'id'))::uuid,
      CASE WHEN choices->>(item->>'id')=item->>'id' THEN account_owner ELSE guest END
    FROM jsonb_array_elements(plan) item WHERE (item->>'conflict')::boolean;
  GET DIAGNOSTICS hidden = ROW_COUNT;
  -- Reserve a distinct, inaccessible owner for displaced account entries so the
  -- one-entry-per-owner/day constraint remains intact. Attribution is retained
  -- in the conflict record, not exposed as a usable guest identity.
  UPDATE sketchlet_drawings d SET owner_hash=md5('merge-hidden:'||d.id)||md5('merge-hidden-owner:'||d.id)
    WHERE d.owner_hash=account_owner AND EXISTS(SELECT 1 FROM sketchlet_link_conflicts c WHERE c.drawing_id=d.id AND c.account_id=account_key);
  UPDATE sketchlet_drawings SET owner_hash=account_owner WHERE owner_hash=guest
    AND id NOT IN (SELECT drawing_id FROM sketchlet_link_conflicts);
  GET DIAGNOSTICS linked = ROW_COUNT;
  -- Keep the account name if one exists, otherwise adopt the guest name.
  INSERT INTO sketchlet_profiles(owner_hash,display_name)
    SELECT account_owner,display_name FROM sketchlet_profiles WHERE owner_hash=guest
    ON CONFLICT(owner_hash) DO NOTHING;
  -- Account votes win duplicates; neither identity may rate its own work.
  DELETE FROM sketchlet_votes v WHERE v.voter_hash IN (guest,account_owner)
    AND EXISTS (SELECT 1 FROM sketchlet_drawings d WHERE d.id=v.drawing_id AND (d.owner_hash IN (guest,account_owner) OR EXISTS(SELECT 1 FROM sketchlet_link_conflicts c WHERE c.drawing_id=d.id AND c.account_id=account_key)));
  INSERT INTO sketchlet_votes(drawing_id,voter_hash,stars,created_at)
    SELECT drawing_id,account_owner,stars,created_at FROM sketchlet_votes WHERE voter_hash=guest
    ON CONFLICT(drawing_id,voter_hash) DO NOTHING;
  DELETE FROM sketchlet_votes WHERE voter_hash=guest;
  -- Preserve the report history and deduplicate any future account report.
  DELETE FROM sketchlet_reports g USING sketchlet_reports a
    WHERE g.reporter_hash=guest AND a.reporter_hash=account_owner AND a.drawing_id=g.drawing_id;
  UPDATE sketchlet_reports SET reporter_hash=account_owner WHERE reporter_hash=guest;
  INSERT INTO sketchlet_guest_links(guest_hash,account_id,linked_count,hidden_count) VALUES(guest,account_key,linked,hidden);
  RETURN jsonb_build_object('linked',linked,'hidden',hidden,'alreadyLinked',false);
END;
$$;


CREATE OR REPLACE FUNCTION sketchlet_redeem_transfer(account_key uuid, secret_hash text, expected text, choices jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE transfer sketchlet_guest_transfers%ROWTYPE; outcome jsonb;
BEGIN
  SELECT * INTO transfer FROM sketchlet_guest_transfers WHERE token_hash=secret_hash FOR UPDATE;
  IF NOT FOUND OR transfer.expires_at <= now() THEN RETURN jsonb_build_object('error','expired'); END IF;
  IF transfer.account_id IS NOT NULL THEN
    IF transfer.account_id=account_key THEN RETURN transfer.result; END IF;
    RETURN jsonb_build_object('error','expired');
  END IF;
  outcome := sketchlet_link_guest(account_key,transfer.guest_hash,expected,choices);
  IF NOT (outcome ? 'error') THEN
    UPDATE sketchlet_guest_transfers SET account_id=account_key,result=outcome WHERE token_hash=secret_hash;
  END IF;
  RETURN outcome;
END;
$$;


-- Old clients can still link nonconflicting work; conflicts require the new UI.
CREATE OR REPLACE FUNCTION sketchlet_link_guest(account_key uuid, guest text, expected text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT sketchlet_link_guest(account_key,guest,expected,'{}'::jsonb); $$;
CREATE OR REPLACE FUNCTION sketchlet_redeem_transfer(account_key uuid, secret_hash text, expected text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT sketchlet_redeem_transfer(account_key,secret_hash,expected,'{}'::jsonb); $$;
