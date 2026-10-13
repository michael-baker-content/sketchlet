import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { sqlStatements } from '../scripts/sql-statements.mjs';

// Deliberately never falls back to DATABASE_URL or reads .env.local.
// Run against a disposable Neon branch using SKETCHLET_TEST_DATABASE_URL.
test('guest linking database transactions and concurrent writes', {
  skip:!process.env.SKETCHLET_TEST_DATABASE_URL,
}, async t => {
  const sql = neon(process.env.SKETCHLET_TEST_DATABASE_URL);
  const schema = 'sketchlet_test_' + randomBytes(10).toString('hex');
  const tx = queries => sql.transaction([sql.query(`SET LOCAL search_path TO "${schema}"`),...queries]);
  const one = async query => (await tx([query])).at(-1);
  const account = randomUUID(), second = randomUUID();
  const owner = 'a'.repeat(64), other = 'b'.repeat(64), guest = 'c'.repeat(64);
  const keep = randomUUID(), conflict = randomUUID(), move = randomUUID(), external = randomUUID();
  await sql.query(`CREATE SCHEMA "${schema}"`);
  try {
    const dir = new URL('../db/',import.meta.url);
    const migrations = [];
    for (const file of (await readdir(dir)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      migrations.push(...sqlStatements(await readFile(new URL(file,dir),'utf8')).map(source => sql.query(source)));
    }
    await tx(migrations);
    // Rerunning all migrations must preserve the final visibility rule.
    await tx(migrations);
    await tx([
      sql`INSERT INTO sketchlet_accounts(id,clerk_instance,clerk_user_id,owner_hash) VALUES
        (${account},'fixture','first',${owner}),(${second},'fixture','second',${other})`,
      sql`INSERT INTO sketchlet_prompts(day,title) VALUES ('2000-01-01','a singing kite'),('2000-01-02','two snails'),('2000-01-03','a frog')`,
      sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES
        (${keep},'2000-01-01',${owner},'keep'),(${conflict},'2000-01-01',${guest},'conflict'),
        (${move},'2000-01-02',${guest},'move'),(${external},'2000-01-03',${other},'external')`,
      sql`INSERT INTO sketchlet_profiles(owner_hash,display_name) VALUES (${guest},'guest name'),(${owner},'account name')`,
      sql`INSERT INTO sketchlet_votes(drawing_id,voter_hash,stars) VALUES
        (${external},${guest},2),(${external},${owner},4),(${move},${owner},3),(${move},${other},5),(${keep},${guest},5)`,
    ]);
    const preview = async g => (await one(sql`SELECT md5(sketchlet_guest_plan(${account},${g})::text) AS revision`))[0].revision;
    const link = (a,g,r,choices={}) => one(sql`SELECT sketchlet_link_guest(${a},${g},${r},${JSON.stringify(choices)}::jsonb) AS result`);
    const revision = await preview(guest);
    await t.test('transfer codes expire, require current review, and can only be consumed by one account',async () => {
      const transferGuest = 'e'.repeat(64), secret = 'f'.repeat(64);
      await one(sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES (${randomUUID()},'2000-01-03',${transferGuest},'transfer')`);
      await one(sql`INSERT INTO sketchlet_guest_transfers(guest_hash,token_hash,expires_at) VALUES (${transferGuest},${secret},now()-interval '1 second')`);
      const redeem = (a,r) => one(sql`SELECT sketchlet_redeem_transfer(${a},${secret},${r}) AS result`);
      const plan = await preview(transferGuest);
      assert.equal((await redeem(account,plan))[0].result.error,'expired');
      await one(sql`UPDATE sketchlet_guest_transfers SET expires_at=now()+interval '15 minutes' WHERE guest_hash=${transferGuest}`);
      assert.equal((await redeem(account,'0'.repeat(32)))[0].result.error,'changed');
      assert.equal((await one(sql`SELECT account_id FROM sketchlet_guest_transfers WHERE guest_hash=${transferGuest}`))[0].account_id,null);
      const result = (await redeem(account,plan))[0].result;
      assert.equal(result.linked,1);
      assert.deepEqual((await redeem(account,plan))[0].result,result);
      assert.equal((await redeem(second,plan))[0].result.error,'expired');
    });
    await t.test('outdated review writes nothing',async () => {
      assert.equal((await link(account,guest,'0'.repeat(32)))[0].result.error,'changed');
      assert.equal((await one(sql`SELECT count(*)::int AS n FROM sketchlet_guest_links WHERE guest_hash=${guest}`))[0].n,0);
    });
    await t.test('links ownership, hides conflicts, preserves received ratings and reconciles self/duplicate votes',async () => {
      for (const choices of [{},{[conflict]:external},{[conflict]:keep,[move]:move}]) {
        assert.equal((await link(account,guest,revision,choices))[0].result.error,'choices');
        assert.equal((await one(sql`SELECT count(*)::int AS n FROM sketchlet_guest_links WHERE guest_hash=${guest}`))[0].n,0);
      }
      assert.deepEqual((await link(account,guest,revision,{[conflict]:keep}))[0].result,{linked:1,hidden:1,alreadyLinked:false});
      const rows = await one(sql`SELECT id,owner_hash,object_key FROM sketchlet_drawings ORDER BY object_key`);
      assert.equal(rows.find(row=>row.id===move).owner_hash,owner);
      assert.equal(rows.find(row=>row.id===move).object_key,'move');
      assert.equal(rows.find(row=>row.id===conflict).owner_hash,guest);
      const visible = await one(sql`SELECT id FROM sketchlet_public_drawings`);
      assert.ok(!visible.some(row=>row.id===conflict));
      assert.ok(visible.some(row=>row.id===move));
      const votes = await one(sql`SELECT drawing_id,voter_hash,stars FROM sketchlet_votes`);
      assert.equal(votes.length,2);
      assert.equal(votes.find(row=>row.drawing_id===external).stars,4);
      assert.equal(votes.find(row=>row.drawing_id===move).stars,5);
      assert.equal((await one(sql`SELECT display_name FROM sketchlet_profiles WHERE owner_hash=${owner}`))[0].display_name,'account name');
    });
    await t.test('repeat-safe for the same account and not claimable by a second account',async () => {
      assert.deepEqual((await link(account,guest,revision))[0].result,{linked:1,hidden:1,alreadyLinked:true});
      assert.equal((await link(second,guest,revision))[0].result.error,'claimed');
    });
    await t.test('retired identities and account self-votes cannot write',async () => {
      for (const query of [
        sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES (${randomUUID()},'2000-01-03',${guest},'late')`,
        sql`UPDATE sketchlet_profiles SET display_name='late' WHERE owner_hash=${guest}`,
        sql`INSERT INTO sketchlet_votes(drawing_id,voter_hash,stars) VALUES (${external},${guest},1)`,
        sql`INSERT INTO sketchlet_votes(drawing_id,voter_hash,stars) VALUES (${move},${owner},1)`,
      ]) await assert.rejects(one(query));
    });
    await t.test('multiple sources can replace the same day while retaining tagged hidden drawings',async () => {
      const waitingSource = '3'.repeat(64), waitingId = randomUUID();
      await one(sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES (${waitingId},'2000-01-01',${waitingSource},${waitingId})`);
      const stale = await preview(waitingSource);
      let previous = keep;
      for (const source of ['1'.repeat(64),'2'.repeat(64)]) {
        const incoming = randomUUID();
        await one(sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES (${incoming},'2000-01-01',${source},${incoming})`);
        await one(sql`INSERT INTO sketchlet_votes(drawing_id,voter_hash,stars) VALUES (${incoming},${other},5),(${previous},${source},2)`);
        const plan = await preview(source);
        let result;
        if (source.startsWith('2')) {
          const secret = randomBytes(32).toString('hex');
          await one(sql`INSERT INTO sketchlet_guest_transfers(guest_hash,token_hash,expires_at) VALUES (${source},${secret},now()+interval '15 minutes')`);
          result = (await one(sql`SELECT sketchlet_redeem_transfer(${account},${secret},${plan},${JSON.stringify({[incoming]:incoming})}::jsonb) AS result`))[0].result;
        } else result = (await link(account,source,plan,{[incoming]:incoming}))[0].result;
        assert.deepEqual(result,{linked:1,hidden:1,alreadyLinked:false});
        const [tag] = await one(sql`SELECT account_id,reason,selected_drawing_id,source_owner_hash FROM sketchlet_link_conflicts WHERE drawing_id=${previous}`);
        assert.deepEqual(tag,{account_id:account,reason:'not selected during account merge',selected_drawing_id:incoming,source_owner_hash:owner});
        assert.equal((await one(sql`SELECT count(*)::int AS n FROM sketchlet_public_drawings WHERE id=${previous}`))[0].n,0);
        assert.equal((await one(sql`SELECT id FROM sketchlet_drawings WHERE owner_hash=${owner} AND prompt_day='2000-01-01'`))[0].id,incoming);
        assert.equal((await one(sql`SELECT stars FROM sketchlet_votes WHERE drawing_id=${incoming} AND voter_hash=${other}`))[0].stars,5);
        assert.equal((await one(sql`SELECT count(*)::int AS n FROM sketchlet_votes WHERE drawing_id=${previous} AND voter_hash IN (${source},${owner})`))[0].n,0);
        previous = incoming;
      }
      assert.equal((await link(account,waitingSource,stale,{[waitingId]:keep}))[0].result.error,'changed');
      assert.equal((await one(sql`SELECT owner_hash FROM sketchlet_drawings WHERE id=${waitingId}`))[0].owner_hash,waitingSource);
    });
    await t.test('a racing guest submission is either reviewed or rejected, never stranded after linking',async () => {
      const racingGuest = 'd'.repeat(64), raceId = randomUUID();
      const plan = await preview(racingGuest);
      const [linked,submitted] = await Promise.allSettled([
        link(account,racingGuest,plan),
        one(sql`INSERT INTO sketchlet_drawings(id,prompt_day,owner_hash,object_key) VALUES (${raceId},'2000-01-03',${racingGuest},'race')`),
      ]);
      assert.equal(linked.status,'fulfilled');
      if (linked.value[0].result.error === 'changed') {
        assert.equal(submitted.status,'fulfilled');
        assert.equal((await one(sql`SELECT count(*)::int AS n FROM sketchlet_guest_links WHERE guest_hash=${racingGuest}`))[0].n,0);
      } else {
        assert.equal(linked.value[0].result.linked,0);
        assert.equal(submitted.status,'rejected');
      }
    });
  } finally {
    // Only the randomly named schema created above; never a shared/public schema.
    await sql.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
});
