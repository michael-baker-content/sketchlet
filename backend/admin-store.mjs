import { neon } from '@neondatabase/serverless';

export function createAdminStore(databaseUrl) {
  const sql = neon(databaseUrl);
  return {
    async limit(key) {
      const [row] = await sql`INSERT INTO sketchlet_rate_limits(key_hash,window_start,request_count)
        VALUES (${key},now(),1) ON CONFLICT(key_hash) DO UPDATE SET
        request_count=CASE WHEN sketchlet_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE sketchlet_rate_limits.request_count+1 END,
        window_start=CASE WHEN sketchlet_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE sketchlet_rate_limits.window_start END
        RETURNING request_count`;
      return row.request_count <= 10;
    },
    async saveState(hash, verifier, previous) {
      await sql.transaction([
        sql`DELETE FROM sketchlet_admin_oauth WHERE expires_at<=now() OR state_hash=${previous}`,
        sql`INSERT INTO sketchlet_admin_oauth(state_hash,verifier,expires_at) VALUES (${hash},${verifier},now()+interval '10 minutes')`,
      ]);
    },
    async consumeState(hash) {
      // DELETE ... RETURNING atomically consumes the challenge across all instances.
      const [row] = await sql`DELETE FROM sketchlet_admin_oauth WHERE state_hash=${hash} AND expires_at>now() RETURNING verifier`;
      return row;
    },
    async createSession(hash, user, previous) {
      await sql.transaction([
        sql`DELETE FROM sketchlet_admin_sessions WHERE expires_at<=now() OR token_hash=${previous}`,
        sql`INSERT INTO sketchlet_admin_sessions(token_hash,github_id,github_login,expires_at)
          VALUES (${hash},${user.id},${user.login},now()+interval '8 hours')`,
        sql`INSERT INTO sketchlet_admin_actions(actor_github_id,actor_login,action,target_type)
          VALUES (${user.id},${user.login},'sign_in','admin_session')`,
      ]);
    },
    async session(hash) {
      const [row] = await sql`SELECT github_id AS id,github_login AS login,expires_at
        FROM sketchlet_admin_sessions WHERE token_hash=${hash} AND expires_at>now()`;
      return row;
    },
    async logout(hash, user) {
      // Only an actual revocation creates an audit entry, including concurrent requests.
      await sql`WITH removed AS (DELETE FROM sketchlet_admin_sessions WHERE token_hash=${hash} RETURNING github_id)
        INSERT INTO sketchlet_admin_actions(actor_github_id,actor_login,action,target_type)
        SELECT github_id,${user.login},'sign_out','admin_session' FROM removed`;
    },
    async activity() {
      return sql`SELECT id::text,actor_login,action,target_type,target_id,before_state,after_state,private_note,created_at
        FROM sketchlet_admin_actions ORDER BY created_at DESC,id DESC LIMIT 50`;
    },
    async submissions(before, filter) {
      return sql`SELECT d.id,d.prompt_day::text AS date,p.title AS prompt,profile.display_name,
        coalesce(m.status,'public') AS status,coalesce(m.public_reason,'') AS reason,
        (SELECT count(*)::int FROM sketchlet_reports r WHERE r.drawing_id=d.id AND r.status='open') AS reports
        FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
        LEFT JOIN sketchlet_profiles profile ON profile.owner_hash=d.owner_hash
        LEFT JOIN sketchlet_drawing_moderation m ON m.drawing_id=d.id
        WHERE (${filter}='all' OR coalesce(m.status,'public')=${filter})
          AND (${before}::uuid IS NULL OR (d.created_at,d.id)<(SELECT created_at,id FROM sketchlet_drawings WHERE id=${before}::uuid))
        ORDER BY d.created_at DESC,d.id DESC LIMIT 25`;
    },
    async image(id) {
      const [row] = await sql`SELECT object_key FROM sketchlet_drawings WHERE id=${id}`;
      return row?.object_key;
    },
    async moderate(id, input, user) {
      const status = input.action === 'hide' ? 'hidden' : 'public';
      // Lock the submission before reading its previous state so concurrent admin
      // decisions cannot record the same stale before-state in the audit trail.
      const [, actions] = await sql.transaction([
        sql`SELECT id FROM sketchlet_drawings WHERE id=${id} FOR UPDATE`,
        sql`WITH previous AS MATERIALIZED (
          SELECT d.id,coalesce(m.status,'public') AS status,coalesce(m.public_reason,'') AS reason
          FROM sketchlet_drawings d LEFT JOIN sketchlet_drawing_moderation m ON m.drawing_id=d.id WHERE d.id=${id}
        ), changed AS (
          INSERT INTO sketchlet_drawing_moderation(drawing_id,status,public_reason,updated_by)
          SELECT id,${status},${input.reason},${user.id} FROM previous WHERE true
          ON CONFLICT(drawing_id) DO UPDATE SET status=EXCLUDED.status,public_reason=EXCLUDED.public_reason,
            updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING drawing_id
        ) INSERT INTO sketchlet_admin_actions(actor_github_id,actor_login,action,target_type,target_id,before_state,after_state,private_note)
          SELECT ${user.id},${user.login},${input.action},'drawing',p.id::text,
            jsonb_build_object('status',p.status,'reason',p.reason),jsonb_build_object('status',${status}::text,'reason',${input.reason}::text),${input.note}
          FROM previous p JOIN changed c ON c.drawing_id=p.id RETURNING id`,
      ]);
      return actions.length > 0;
    },
    async clearName(id, note, user) {
      const [, actions] = await sql.transaction([
        sql`SELECT profile.owner_hash FROM sketchlet_profiles profile JOIN sketchlet_drawings d ON d.owner_hash=profile.owner_hash WHERE d.id=${id} FOR UPDATE OF profile`,
        sql`WITH previous AS MATERIALIZED (
          SELECT p.owner_hash,p.display_name FROM sketchlet_profiles p JOIN sketchlet_drawings d ON d.owner_hash=p.owner_hash WHERE d.id=${id}
        ), changed AS (
          UPDATE sketchlet_profiles SET display_name='',updated_at=now() WHERE owner_hash IN (SELECT owner_hash FROM previous) RETURNING owner_hash
        ) INSERT INTO sketchlet_admin_actions(actor_github_id,actor_login,action,target_type,target_id,before_state,after_state,private_note)
          SELECT ${user.id},${user.login},'clear_name','profile',p.owner_hash,jsonb_build_object('name',p.display_name),jsonb_build_object('name',''),${note}
          FROM previous p JOIN changed c USING(owner_hash) RETURNING id`,
      ]);
      return actions.length > 0;
    },
    async reports(before, status) {
      return sql`SELECT r.id::text,r.drawing_id,r.category,r.explanation,r.status,r.created_at,
        d.prompt_day::text AS date,p.title AS prompt,profile.display_name,coalesce(m.status,'public') AS drawing_status
        FROM sketchlet_reports r JOIN sketchlet_drawings d ON d.id=r.drawing_id
        JOIN sketchlet_prompts p ON p.day=d.prompt_day
        LEFT JOIN sketchlet_profiles profile ON profile.owner_hash=d.owner_hash
        LEFT JOIN sketchlet_drawing_moderation m ON m.drawing_id=d.id
        WHERE r.status=${status} AND (${before}::bigint IS NULL OR r.id<${before}::bigint)
        ORDER BY r.id DESC LIMIT 25`;
    },
    async resolveReport(id, note, user) {
      const rows = await sql`WITH changed AS (
        UPDATE sketchlet_reports SET status='resolved',resolved_at=now(),resolved_by=${user.id}
        WHERE id=${id}::bigint AND status='open' RETURNING id
      ) INSERT INTO sketchlet_admin_actions(actor_github_id,actor_login,action,target_type,target_id,before_state,after_state,private_note)
        SELECT ${user.id},${user.login},'resolve_report','report',id::text,'{"status":"open"}'::jsonb,'{"status":"resolved"}'::jsonb,${note}
        FROM changed RETURNING id`;
      return rows.length > 0;
    },
  };
}
