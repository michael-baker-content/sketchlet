-- Only hashes of random transfer secrets are retained. New codes replace old ones.
CREATE TABLE IF NOT EXISTS sketchlet_guest_transfers (
  guest_hash text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  account_id uuid REFERENCES sketchlet_accounts(id),
  result jsonb
);

CREATE OR REPLACE FUNCTION sketchlet_redeem_transfer(account_key uuid, secret_hash text, expected text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE transfer sketchlet_guest_transfers%ROWTYPE; outcome jsonb;
BEGIN
  SELECT * INTO transfer FROM sketchlet_guest_transfers WHERE token_hash=secret_hash FOR UPDATE;
  IF NOT FOUND OR transfer.expires_at <= now() THEN RETURN jsonb_build_object('error','expired'); END IF;
  IF transfer.account_id IS NOT NULL THEN
    IF transfer.account_id=account_key THEN RETURN transfer.result; END IF;
    RETURN jsonb_build_object('error','expired');
  END IF;
  outcome := sketchlet_link_guest(account_key,transfer.guest_hash,expected);
  IF NOT (outcome ? 'error') THEN
    UPDATE sketchlet_guest_transfers SET account_id=account_key,result=outcome WHERE token_hash=secret_hash;
  END IF;
  RETURN outcome;
END;
$$;
