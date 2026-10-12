-- A claimed guest identity is permanently retired, never an account credential.
CREATE TABLE IF NOT EXISTS sketchlet_guest_links (
  guest_hash text PRIMARY KEY CHECK (guest_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid NOT NULL REFERENCES sketchlet_accounts(id),
  linked_count integer NOT NULL,
  hidden_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sketchlet_link_conflicts (
  drawing_id uuid PRIMARY KEY REFERENCES sketchlet_drawings(id),
  account_id uuid NOT NULL REFERENCES sketchlet_accounts(id),
  reason text NOT NULL DEFAULT 'account-linking conflict',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW sketchlet_public_drawings AS
SELECT d.* FROM sketchlet_drawings d
WHERE NOT EXISTS (SELECT 1 FROM sketchlet_drawing_moderation m WHERE m.drawing_id=d.id AND m.status<>'public')
AND NOT EXISTS (SELECT 1 FROM sketchlet_link_conflicts c WHERE c.drawing_id=d.id);

-- Writers and linking use the same transaction locks. A request that began
-- before linking cannot write with the retired guest identity afterward.
CREATE OR REPLACE FUNCTION sketchlet_guard_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE identity_hash text;
BEGIN
  identity_hash := to_jsonb(NEW)->>TG_ARGV[0];
  PERFORM pg_advisory_xact_lock(hashtextextended(identity_hash, 0));
  IF EXISTS (SELECT 1 FROM sketchlet_guest_links WHERE guest_hash=identity_hash) THEN
    RAISE EXCEPTION 'guest identity retired' USING ERRCODE='P0001';
  END IF;
  IF TG_TABLE_NAME='sketchlet_votes' AND EXISTS (
    SELECT 1 FROM sketchlet_drawings d WHERE d.id=(to_jsonb(NEW)->>'drawing_id')::uuid AND d.owner_hash=identity_hash
  ) THEN
    RAISE EXCEPTION 'cannot rate own drawing' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sketchlet_drawings_identity ON sketchlet_drawings;
CREATE TRIGGER sketchlet_drawings_identity BEFORE INSERT OR UPDATE ON sketchlet_drawings
FOR EACH ROW EXECUTE FUNCTION sketchlet_guard_identity('owner_hash');
DROP TRIGGER IF EXISTS sketchlet_profiles_identity ON sketchlet_profiles;
CREATE TRIGGER sketchlet_profiles_identity BEFORE INSERT OR UPDATE ON sketchlet_profiles
FOR EACH ROW EXECUTE FUNCTION sketchlet_guard_identity('owner_hash');
DROP TRIGGER IF EXISTS sketchlet_votes_identity ON sketchlet_votes;
CREATE TRIGGER sketchlet_votes_identity BEFORE INSERT OR UPDATE ON sketchlet_votes
FOR EACH ROW EXECUTE FUNCTION sketchlet_guard_identity('voter_hash');
DROP TRIGGER IF EXISTS sketchlet_reports_identity ON sketchlet_reports;
CREATE TRIGGER sketchlet_reports_identity BEFORE INSERT ON sketchlet_reports
FOR EACH ROW EXECUTE FUNCTION sketchlet_guard_identity('reporter_hash');

CREATE OR REPLACE FUNCTION sketchlet_guest_plan(account_key uuid, guest text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'date',d.prompt_day::text,'prompt',p.title,
    'conflict',EXISTS(SELECT 1 FROM sketchlet_drawings existing
      WHERE existing.owner_hash=a.owner_hash AND existing.prompt_day=d.prompt_day)) ORDER BY d.prompt_day DESC),'[]'::jsonb)
  FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
  CROSS JOIN sketchlet_accounts a WHERE a.id=account_key AND d.owner_hash=guest;
$$;

CREATE OR REPLACE FUNCTION sketchlet_link_guest(account_key uuid, guest text, expected text) RETURNS jsonb
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
  INSERT INTO sketchlet_link_conflicts(drawing_id,account_id)
    SELECT (item->>'id')::uuid,account_key FROM jsonb_array_elements(plan) item WHERE (item->>'conflict')::boolean;
  GET DIAGNOSTICS hidden = ROW_COUNT;
  UPDATE sketchlet_drawings SET owner_hash=account_owner WHERE owner_hash=guest
    AND id NOT IN (SELECT drawing_id FROM sketchlet_link_conflicts);
  GET DIAGNOSTICS linked = ROW_COUNT;
  -- Keep the account name if one exists, otherwise adopt the guest name.
  INSERT INTO sketchlet_profiles(owner_hash,display_name)
    SELECT account_owner,display_name FROM sketchlet_profiles WHERE owner_hash=guest
    ON CONFLICT(owner_hash) DO NOTHING;
  -- Account votes win duplicates; neither identity may rate its own work.
  DELETE FROM sketchlet_votes v WHERE v.voter_hash IN (guest,account_owner)
    AND EXISTS (SELECT 1 FROM sketchlet_drawings d WHERE d.id=v.drawing_id AND d.owner_hash IN (guest,account_owner));
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
