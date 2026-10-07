import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { easternDate, promptForDate } from '../src/prompts.js';
import { CANVAS_SIZE } from '../src/model.js';
import { drawingPath } from '../src/drawing-links.js';
import { readJson as body, allowedOrigins } from './http.mjs';
import { normalizeDisplayName, profileDrawingCursor } from './profile.mjs';
import { requireRatingName, validateVote, networkLimitKey, parseSkipped, balanceRatingQueue } from './ratings.mjs';

const sql = neon(process.env.DATABASE_URL);
const storage = new S3Client({ endpoint: process.env.AWS_ENDPOINT_URL_S3, region: process.env.AWS_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
const bucket = process.env.DRAWINGS_BUCKET || 'drawings';
const origins = allowedOrigins();
const origin = origins.values().next().value || 'https://sketchlet.invalid';
const secure = !!process.env.VERCEL || origin.startsWith('https:');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function visitor(req, res) {
  let token = (req.headers.cookie || '').match(/(?:^|;\s*)sketchlet_guest=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) { token = randomBytes(32).toString('hex'); res.setHeader('Set-Cookie', `sketchlet_guest=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure ? '; Secure' : ''}`); }
  return createHash('sha256').update(token).digest('hex');
}
async function limit(owner, maximum = 40) {
  const [record] = await sql`INSERT INTO sketchlet_rate_limits(key_hash,window_start,request_count) VALUES (${owner},now(),1)
    ON CONFLICT(key_hash) DO UPDATE SET
      request_count=CASE WHEN sketchlet_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE sketchlet_rate_limits.request_count+1 END,
      window_start=CASE WHEN sketchlet_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE sketchlet_rate_limits.window_start END
    RETURNING request_count`;
  if(record.request_count>maximum)fail(429,'please wait a moment before trying again');
}
async function today() {
  const day = easternDate();
  const [record] = await sql`INSERT INTO sketchlet_prompts(day,title) VALUES (${day},${promptForDate(day)}) ON CONFLICT(day) DO UPDATE SET day=EXCLUDED.day RETURNING day::text,title`;
  return record;
}
function publicDrawing(row, owner) {
  return { id: row.id, date: row.day, prompt: row.title, displayName: row.display_name || '', image: `/api/drawings/${row.id}/image`, url: drawingPath(row.id, row.title), mine: row.owner_hash === owner, average: row.average === null ? null : Number(row.average), count: Number(row.count || 0), myVote: row.my_vote ? Number(row.my_vote) : null };
}
async function drawings(owner, day = null, id = null, queue = false) {
  return sql`SELECT d.id, d.prompt_day::text AS day, p.title, d.owner_hash, profile.display_name,
    (SELECT avg(stars) FROM sketchlet_votes v WHERE v.drawing_id=d.id) AS average,
    (SELECT count(*) FROM sketchlet_votes v WHERE v.drawing_id=d.id) AS count,
    (SELECT stars FROM sketchlet_votes v WHERE v.drawing_id=d.id AND v.voter_hash=${owner}) AS my_vote
    FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
    LEFT JOIN sketchlet_profiles profile ON profile.owner_hash=d.owner_hash
    WHERE (${day}::date IS NULL OR d.prompt_day=${day}::date) AND (${id}::uuid IS NULL OR d.id=${id}::uuid)
    AND (NOT ${queue} OR (d.owner_hash<>${owner} AND NOT EXISTS(SELECT 1 FROM sketchlet_votes v WHERE v.drawing_id=d.id AND v.voter_hash=${owner})))
    ORDER BY d.prompt_day DESC, d.created_at DESC LIMIT 200`;
}
async function imageBytes(input) {
  if (typeof input !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input)) fail(400, 'please submit a PNG drawing');
  const bytes = Buffer.from(input.slice('data:image/png;base64,'.length), 'base64');
  try {
    const image = sharp(bytes, { limitInputPixels: 1440000 });
    const metadata = await image.metadata();
    if (metadata.format !== 'png' || metadata.width !== CANVAS_SIZE || metadata.height !== CANVAS_SIZE || (metadata.pages || 1) !== 1) fail(400, `drawing must be a ${CANVAS_SIZE} × ${CANVAS_SIZE} PNG`);
    return await image.png().toBuffer();
  } catch (error) { if (error.status) throw error; fail(400, 'could not read this drawing'); }
}
export async function handleApi(req, res, pathname) {
  try {
    if (!['GET', 'POST'].includes(req.method)) fail(405, 'method not allowed');
    res.setHeader('Cache-Control','private, no-store');
    if (req.method === 'POST' && !origins.has(req.headers.origin)) fail(403, 'request origin does not match this site');
    const owner = visitor(req, res);
    if(req.method==='POST' || pathname==='/api/queue') {
      const network = networkLimitKey(req);
      if (network) await limit(network, 120);
      await limit(owner);
    }
    const url = new URL(req.url, origin);
    if (pathname === '/api/profile/drawings' && req.method === 'GET') {
      const before = profileDrawingCursor(url.searchParams.get('before'));
      // The authenticated guest cookie is the only ownership filter. One entry per day
      // makes the prompt date a stable cursor even when new drawings are submitted.
      const rows = await sql`SELECT d.id,d.prompt_day::text AS day,p.title,d.owner_hash,profile.display_name,
        (SELECT avg(stars) FROM sketchlet_votes v WHERE v.drawing_id=d.id) AS average,
        (SELECT count(*) FROM sketchlet_votes v WHERE v.drawing_id=d.id) AS count
        FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
        LEFT JOIN sketchlet_profiles profile ON profile.owner_hash=d.owner_hash
        WHERE d.owner_hash=${owner} AND (${before}::date IS NULL OR d.prompt_day<${before}::date)
        ORDER BY d.prompt_day DESC LIMIT 25`;
      const page = rows.slice(0,24);
      json(res,200,{drawings:page.map(row=>publicDrawing(row,owner)),next:rows.length>24?page.at(-1).day:null}); return;
    }
    if (pathname === '/api/profile' && req.method === 'GET') {
      const [profile] = await sql`SELECT display_name FROM sketchlet_profiles WHERE owner_hash=${owner}`;
      json(res,200,{displayName:profile?.display_name ?? null}); return;
    }
    if (pathname === '/api/profile' && req.method === 'POST') {
      const input = await body(req);
      const displayName = normalizeDisplayName(input.displayName);
      // Ownership comes only from the guest cookie, never a submitted name or id.
      await sql`INSERT INTO sketchlet_profiles(owner_hash,display_name) VALUES (${owner},${displayName})
        ON CONFLICT(owner_hash) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()`;
      json(res, 200, { displayName }); return;
    }
    if (pathname === '/api/today' && req.method === 'GET') {
      const prompt = await today();
      const [mine] = await sql`SELECT id FROM sketchlet_drawings WHERE owner_hash=${owner} AND prompt_day=${prompt.day}::date`;
      const rows = mine ? await drawings(owner, null, mine.id) : [];
      const days = await sql`SELECT prompt_day::text AS day FROM sketchlet_drawings WHERE owner_hash=${owner} ORDER BY prompt_day DESC LIMIT 3660`;
      const set = new Set(days.map(row => row.day)); let streak = 0;
      let end = Date.parse(prompt.day + 'T12:00:00Z');
      if (!set.has(prompt.day)) end -= 86400000;
      while (set.has(new Date(end - streak * 86400000).toISOString().slice(0,10))) streak++;
      const [profile] = await sql`SELECT display_name FROM sketchlet_profiles WHERE owner_hash=${owner}`;
      json(res, 200, { date: prompt.day, prompt: prompt.title, displayName: profile?.display_name ?? null, submission: rows[0] ? publicDrawing(rows[0], owner) : null, streak }); return;
    }
    if (pathname === '/api/drawings' && req.method === 'POST') {
      const input = await body(req); const prompt = await today();
      if (input.date !== prompt.day) fail(409, 'the daily prompt has changed. your draft is still saved on this device; refresh before submitting.');
      const [existing] = await sql`SELECT id FROM sketchlet_drawings WHERE owner_hash=${owner} AND prompt_day=${prompt.day}::date`;
      if (existing) { json(res, 200, publicDrawing((await drawings(owner, null, existing.id))[0], owner)); return; }
      const bytes = await imageBytes(input.image);
      const id = randomUUID(); const key = `drawings/${prompt.day}/${id}.png`;
      await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/png' }));
      // On an ambiguous database failure retain the object: a commit may have succeeded.
      const inserted = await sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES (${id},${prompt.day},${owner},${key}) ON CONFLICT(owner_hash,prompt_day) DO NOTHING RETURNING id`;
      if (!inserted.length) {
        try { await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { console.error('Unused upload cleanup failed; reconcile storage before launch.'); }
        const [winner] = await sql`SELECT id FROM sketchlet_drawings WHERE owner_hash=${owner} AND prompt_day=${prompt.day}::date`;
        json(res, 200, publicDrawing((await drawings(owner, null, winner.id))[0], owner)); return;
      }
      json(res, 201, publicDrawing((await drawings(owner, null, id))[0], owner)); return;
    }
    if (pathname === '/api/archive' && req.method === 'GET') {
      const rows = await sql`WITH prompt_groups AS (
        SELECT p.day,p.title,count(d.id)::int AS count
        FROM sketchlet_prompts p JOIN sketchlet_drawings d ON d.prompt_day=p.day
        GROUP BY p.day,p.title ORDER BY p.day DESC LIMIT 90
      ) SELECT p.day::text AS date,p.title AS prompt,p.count,cover.id AS cover_id
        FROM prompt_groups p CROSS JOIN LATERAL (
          SELECT d.id FROM sketchlet_drawings d
          LEFT JOIN sketchlet_votes v ON v.drawing_id=d.id
          WHERE d.prompt_day=p.day GROUP BY d.id
          ORDER BY avg(v.stars) DESC NULLS LAST,count(v.stars) DESC,d.created_at DESC,d.id DESC
          LIMIT 1
        ) cover ORDER BY p.day DESC`;
      json(res, 200, rows.map(({cover_id,...prompt}) => ({...prompt,image:`/api/drawings/${cover_id}/image` }))); return;
    }
    if (pathname === '/api/gallery' && req.method === 'GET') {
      const day = url.searchParams.get('date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !Number.isFinite(Date.parse(day))) fail(400, 'invalid prompt date');
      json(res, 200, (await drawings(owner, day)).map(row => publicDrawing(row, owner))); return;
    }
    if (pathname === '/api/queue' && req.method === 'GET') {
      const [profile] = await sql`SELECT display_name FROM sketchlet_profiles WHERE owner_hash=${owner}`;
      requireRatingName(profile?.display_name);
      const skipped = parseSkipped(url.searchParams.get('skip'));
      const day = easternDate();
      // Rank across the whole archive before limiting, with separate daily pools.
      const rows = await sql`WITH eligible AS (
        SELECT d.id,d.prompt_day::text AS day,p.title,d.owner_hash,profile.display_name,
          stats.average,stats.count,random() AS lottery
        FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
        LEFT JOIN sketchlet_profiles profile ON profile.owner_hash=d.owner_hash
        CROSS JOIN LATERAL (SELECT avg(stars) AS average,count(*) AS count FROM sketchlet_votes v WHERE v.drawing_id=d.id) stats
        WHERE d.owner_hash<>${owner} AND NOT(d.id=ANY(${skipped}::uuid[]))
          AND NOT EXISTS(SELECT 1 FROM sketchlet_votes v WHERE v.drawing_id=d.id AND v.voter_hash=${owner})
      ), ranked AS (
        SELECT *,row_number() OVER(PARTITION BY day=${day} ORDER BY count,lottery) AS low_rank,
          row_number() OVER(PARTITION BY day=${day} ORDER BY coalesce(average,0)*count/(count+5) DESC,lottery) AS favorite_rank
        FROM eligible
      ) SELECT * FROM ranked WHERE low_rank<=60 OR favorite_rank<=20`;
      const items = rows.map(row => ({ ...publicDrawing(row,owner), lottery: Number(row.lottery) }));
      json(res,200,balanceRatingQueue(items,day).map(({lottery,...item}) => item)); return;
    }
    const match = pathname.match(/^\/api\/drawings\/([^/]+)(?:\/(image|vote))?$/);
    if (match) {
      const [, id, action] = match; if (!uuid.test(id)) fail(404,'drawing not found');
      if (action === 'vote' && req.method === 'POST') {
        const input = await body(req);
        const [profile] = await sql`SELECT display_name FROM sketchlet_profiles WHERE owner_hash=${owner}`;
        requireRatingName(profile?.display_name);
        const [drawing] = await sql`SELECT owner_hash FROM sketchlet_drawings WHERE id=${id}`;
        if (!drawing) fail(404,'drawing not found');
        validateVote(profile.display_name,owner,drawing.owner_hash,input.stars);
        await sql`INSERT INTO sketchlet_votes(drawing_id,voter_hash,stars) VALUES (${id},${owner},${input.stars})
          ON CONFLICT(drawing_id,voter_hash) DO UPDATE SET stars=EXCLUDED.stars`;
        json(res,200,publicDrawing((await drawings(owner,null,id))[0],owner)); return;
      }
      if (req.method !== 'GET' || (action && action !== 'image')) fail(405,'method not allowed');
      if (action === 'image') {
        const [drawing] = await sql`SELECT object_key FROM sketchlet_drawings WHERE id=${id}`; if (!drawing) fail(404,'drawing not found');
        const object = await storage.send(new GetObjectCommand({ Bucket:bucket, Key:drawing.object_key }));
        const bytes = await object.Body.transformToByteArray();
        res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, max-age=3600'}); res.end(Buffer.from(bytes)); return;
      }
      const [drawing] = await drawings(owner,null,id); if (!drawing) fail(404,'drawing not found'); json(res,200,publicDrawing(drawing,owner)); return;
    }
    fail(404,'not found');
  } catch (error) {
    if (error.status) { if(error.status===429)res.setHeader('Retry-After','60'); json(res,error.status,{error:error.message,...(error.code ? {code:error.code} : {})}); }
    else { console.error('Gallery request failed. Verify migrations, Neon connectivity, and bucket access.'); json(res,503,{error:'the gallery is temporarily unavailable. your draft is still on this device.'}); }
  }
}
