import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { accountConfig, verifyAccountSession } from './account-auth.mjs';
import { httpError, readJson } from './http.mjs';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function groupInput(input,creating=false) {
  const allowed=creating?['name','description','listed']:['description','listed'];
  if(Object.keys(input).some(key=>!allowed.includes(key))) throw httpError(400,'unexpected group fields');
  const description=input.description ?? '';
  if(typeof description!=='string'||description.trim().length>400||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(description)) throw httpError(400,'use a description of up to 400 characters');
  if(typeof input.listed!=='boolean') throw httpError(400,'choose listed or unlisted');
  const result={description:description.trim(),listed:input.listed};
  if(creating) {
    if(typeof input.name!=='string') throw httpError(400,'enter a group name');
    result.name=input.name.trim().replace(/\s+/g,' ');
    if(!/^[a-z0-9][a-z0-9 _'-]{2,39}$/i.test(result.name)) throw httpError(400,'use 3–40 letters, numbers, spaces, hyphens, apostrophes, or underscores for the name');
  }
  return result;
}

export function createGroupStore(sql) {
  return {
    async account(instance,user) { const [row]=await sql`SELECT id FROM sketchlet_accounts WHERE clerk_instance=${instance} AND clerk_user_id=${user}`;return row; },
    async limit(id) {
      const [row]=await sql`INSERT INTO sketchlet_rate_limits(key_hash,window_start,request_count) VALUES(${'groups:'+id},now(),1)
        ON CONFLICT(key_hash) DO UPDATE SET request_count=CASE WHEN sketchlet_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE sketchlet_rate_limits.request_count+1 END,
        window_start=CASE WHEN sketchlet_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE sketchlet_rate_limits.window_start END RETURNING request_count`;
      return row.request_count<=30;
    },
    async mine(actor) {
      return sql`SELECT g.id,g.name,g.description,g.listed,m.status,CASE WHEN g.owner_id=${actor} THEN 'owner' ELSE m.role END AS role
        FROM sketchlet_groups g JOIN sketchlet_group_members m ON m.group_id=g.id WHERE m.account_id=${actor} ORDER BY lower(g.name) LIMIT 100`;
    },
    async search(query) {
      return sql`SELECT id,name,description FROM sketchlet_groups WHERE listed AND strpos(lower(name),lower(${query}))>0 ORDER BY lower(name) LIMIT 30`;
    },
    async detail(id,actor) {
      const [g]=await sql`SELECT g.id,g.name,g.description,g.listed,g.owner_id,m.status,CASE WHEN g.owner_id=${actor} THEN 'owner' ELSE m.role END AS role,
        CASE WHEN m.status='active' THEN (SELECT coalesce(jsonb_agg(member_rows),'[]'::jsonb) FROM (
          SELECT gm.account_id AS id,coalesce(nullif(p.display_name,''),'anonymous') AS name,gm.status,
            CASE WHEN gm.account_id=g.owner_id THEN 'owner' ELSE gm.role END AS role,gm.account_id=${actor} AS me
          FROM sketchlet_group_members gm JOIN sketchlet_accounts a ON a.id=gm.account_id LEFT JOIN sketchlet_profiles p ON p.owner_hash=a.owner_hash
          WHERE gm.group_id=g.id AND (gm.status='active' OR g.owner_id=${actor} OR m.role='approver') ORDER BY gm.created_at,gm.account_id LIMIT 200
        ) member_rows) ELSE NULL END AS members
        FROM sketchlet_groups g LEFT JOIN sketchlet_group_members m ON m.group_id=g.id AND m.account_id=${actor} WHERE g.id=${id}`;
      if(!g)return null;
      const result={id:g.id,name:g.name,description:g.description,status:g.status || null,role:g.status==='active'?g.role:null};
      if(g.status!=='active')return result;
      result.listed=g.listed;
      result.members=g.members;
      return result;
    },
    async create(actor,input) {
      const id=randomUUID();
      const [,rows]=await sql.transaction([
        sql`SELECT id FROM sketchlet_accounts WHERE id=${actor} FOR UPDATE`,
        sql`WITH added AS (
          INSERT INTO sketchlet_groups(id,name,description,listed,owner_id)
          SELECT ${id},${input.name},${input.description},${input.listed},${actor}
          WHERE (SELECT count(*) FROM sketchlet_groups WHERE owner_id=${actor})<20
            AND (SELECT count(*) FROM sketchlet_group_members WHERE account_id=${actor})<100
          ON CONFLICT DO NOTHING RETURNING id
        ), member AS (INSERT INTO sketchlet_group_members(group_id,account_id,status) SELECT id,${actor},'active' FROM added),
        event AS (INSERT INTO sketchlet_group_events(group_id,actor_id,action) SELECT id,${actor},'create' FROM added)
        SELECT id FROM added`,
      ]);
      return rows[0];
    },
    async suggestion(name) {
      const [row]=await sql`SELECT ${name.slice(0,35)}||'-'||n AS name FROM generate_series(1,100) n
        WHERE NOT EXISTS(SELECT 1 FROM sketchlet_groups WHERE lower(name)=lower(${name.slice(0,35)}||'-'||n)) ORDER BY n LIMIT 1`;
      return row?.name || null;
    },
    async nameTaken(name) {return (await sql`SELECT id FROM sketchlet_groups WHERE lower(name)=lower(${name})`).length>0;},
    async action(actor,id,operation,input) {
      const [row]=await sql`SELECT sketchlet_group_action(${actor}::uuid,${id}::uuid,${operation},${input.target || null}::uuid,${JSON.stringify(input)}::jsonb) AS result`;
      return row.result;
    },
  };
}

export function createGroupsHandler({getStore,getConfig=accountConfig,verify=verifyAccountSession}) {
  return async(req,res,path)=>{
    res.setHeader('Cache-Control','private, no-store');
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try {
      const config=getConfig();if(!config)throw httpError(503,'groups require account sign-in');
      if(!['GET','POST'].includes(req.method))throw httpError(405,'method not allowed');
      if(req.method==='POST'&&!config.origins.has(req.headers.origin))throw httpError(403,'request origin does not match this site');
      const user=await verify(req,config),store=await getStore(),account=await store.account(config.frontendHost,user);
      if(!account)throw httpError(409,'finish connecting your account on profile first');
      const actor=account.id,url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&path==='/api/groups')return send(200,{groups:await store.mine(actor)});
      if(req.method==='GET'&&path==='/api/groups/search') {
        const q=(url.searchParams.get('q')||'').trim();
        if(q.length<2||q.length>40)throw httpError(400,'enter 2–40 characters to find a group');
        return send(200,{groups:await store.search(q)});
      }
      const match=/^\/api\/groups\/([^/]+)(?:\/([a-z]+))?$/.exec(path),id=match?.[1],operation=match?.[2];
      if(req.method==='GET'&&uuid.test(id||'')&&!operation) {
        const group=await store.detail(id,actor);if(!group)throw httpError(404,'group not found');return send(200,{group});
      }
      if(req.method!=='POST')throw httpError(404,'not found');
      if(!await store.limit(actor))throw httpError(429,'please wait a minute before changing groups again');
      const raw=await readJson(req);
      if(path==='/api/groups') {
        const input=groupInput(raw,true),created=await store.create(actor,input);
        if(!created) {
          if(await store.nameTaken(input.name))return send(409,{error:'that group name is already taken',suggestion:await store.suggestion(input.name)});
          throw httpError(409,'you can own up to 20 groups and belong to or request up to 100');
        }
        return send(201,{id:created.id});
      }
      if(!uuid.test(id||'')||!['request','leave','settings','approve','decline','grant','revoke','remove','transfer'].includes(operation))throw httpError(404,'not found');
      let input=raw;
      if(operation==='settings')input=groupInput(raw);
      else if(['request','leave'].includes(operation)) {if(Object.keys(raw).length)throw httpError(400,'unexpected group fields');}
      else if(Object.keys(raw).length!==1||typeof raw.target!=='string'||!uuid.test(raw.target))throw httpError(400,'choose a group member');
      const result=await store.action(actor,id,operation,input);
      const errors={missing:[404,'group not found'],permission:[403,'you do not have permission to do that'],owner:[409,'transfer ownership before leaving or changing your own role'],changed:[409,'membership changed. reopen the group and try again'],limit:[409,'this group or account has reached its membership/request limit']};
      if(result.error)throw httpError(...(errors[result.error]||[400,'invalid group action']));
      send(200,{ok:true});
    } catch(error) {send(error.status||503,{error:error.status?error.message:'groups are temporarily unavailable. please try again.'});}
  };
}
let store;
export const handleGroups=createGroupsHandler({getStore:async()=>store ||= createGroupStore(neon(process.env.DATABASE_URL))});
