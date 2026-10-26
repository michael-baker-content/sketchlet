CREATE TABLE IF NOT EXISTS sketchlet_groups (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK(length(name) BETWEEN 3 AND 40),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=400),
  listed boolean NOT NULL DEFAULT true,
  owner_id uuid NOT NULL REFERENCES sketchlet_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sketchlet_groups_name_idx ON sketchlet_groups(lower(name));
CREATE TABLE IF NOT EXISTS sketchlet_group_members (
  group_id uuid NOT NULL REFERENCES sketchlet_groups(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES sketchlet_accounts(id),
  status text NOT NULL CHECK(status IN ('pending','active')),
  role text NOT NULL DEFAULT 'member' CHECK(role IN ('member','approver')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,account_id),
  CHECK(status='active' OR role='member')
);
CREATE INDEX IF NOT EXISTS sketchlet_group_members_account_idx ON sketchlet_group_members(account_id,group_id);
CREATE TABLE IF NOT EXISTS sketchlet_group_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES sketchlet_groups(id),
  actor_id uuid NOT NULL REFERENCES sketchlet_accounts(id),
  action text NOT NULL,
  target_id uuid REFERENCES sketchlet_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- All membership decisions serialize on the group row, including changes to
-- the actor's own permissions. Browser-provided roles are never trusted.
CREATE OR REPLACE FUNCTION sketchlet_group_action(actor uuid, group_key uuid, operation text, target uuid, settings jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g sketchlet_groups%ROWTYPE; membership sketchlet_group_members%ROWTYPE; can_approve boolean;
BEGIN
  SELECT * INTO g FROM sketchlet_groups WHERE id=group_key FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','missing'); END IF;
  SELECT * INTO membership FROM sketchlet_group_members WHERE group_id=group_key AND account_id=actor;
  can_approve := g.owner_id=actor OR (membership.status='active' AND membership.role='approver');
  IF operation='request' THEN
    PERFORM id FROM sketchlet_accounts WHERE id=actor FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM sketchlet_group_members WHERE group_id=group_key AND account_id=actor)
      AND ((SELECT count(*) FROM sketchlet_group_members WHERE group_id=group_key)>=200
        OR (SELECT count(*) FROM sketchlet_group_members WHERE account_id=actor)>=100) THEN
      RETURN jsonb_build_object('error','limit');
    END IF;
    INSERT INTO sketchlet_group_members(group_id,account_id,status) VALUES(group_key,actor,'pending') ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
  ELSIF operation='leave' THEN
    IF g.owner_id=actor THEN RETURN jsonb_build_object('error','owner'); END IF;
    DELETE FROM sketchlet_group_members WHERE group_id=group_key AND account_id=actor;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
  ELSIF operation='settings' THEN
    IF NOT coalesce(can_approve,false) THEN RETURN jsonb_build_object('error','permission'); END IF;
    UPDATE sketchlet_groups SET description=settings->>'description',listed=(settings->>'listed')::boolean WHERE id=group_key;
  ELSIF operation IN ('approve','decline') THEN
    IF NOT coalesce(can_approve,false) THEN RETURN jsonb_build_object('error','permission'); END IF;
    IF operation='approve' THEN
      UPDATE sketchlet_group_members SET status='active' WHERE group_id=group_key AND account_id=target AND status='pending';
    ELSE
      DELETE FROM sketchlet_group_members WHERE group_id=group_key AND account_id=target AND status='pending';
    END IF;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','changed'); END IF;
  ELSIF operation IN ('grant','revoke','remove','transfer') THEN
    IF g.owner_id<>actor THEN RETURN jsonb_build_object('error','permission'); END IF;
    IF target=actor THEN RETURN jsonb_build_object('error','owner'); END IF;
    IF NOT EXISTS(SELECT 1 FROM sketchlet_group_members WHERE group_id=group_key AND account_id=target AND status='active') THEN
      RETURN jsonb_build_object('error','changed');
    END IF;
    IF operation='remove' THEN
      DELETE FROM sketchlet_group_members WHERE group_id=group_key AND account_id=target;
    ELSIF operation='transfer' THEN
      PERFORM id FROM sketchlet_accounts WHERE id=target FOR UPDATE;
      IF (SELECT count(*) FROM sketchlet_groups WHERE owner_id=target)>=20 THEN RETURN jsonb_build_object('error','limit'); END IF;
      UPDATE sketchlet_groups SET owner_id=target WHERE id=group_key;
      UPDATE sketchlet_group_members SET role='member' WHERE group_id=group_key AND account_id IN (actor,target);
    ELSE
      UPDATE sketchlet_group_members SET role=CASE WHEN operation='grant' THEN 'approver' ELSE 'member' END WHERE group_id=group_key AND account_id=target;
    END IF;
  ELSE RETURN jsonb_build_object('error','operation');
  END IF;
  INSERT INTO sketchlet_group_events(group_id,actor_id,action,target_id) VALUES(group_key,actor,operation,target);
  RETURN jsonb_build_object('ok',true);
END;
$$;
