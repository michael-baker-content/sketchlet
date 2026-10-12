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
    const link = (a,g,r) => one(sql`SELECT sketchlet_link_guest(${a},${g},${r}) AS result`);
    const revision = await preview(guest);
    await t.test('outdated review writes nothing',async () => {
      assert.equal((await link(account,guest,'0'.repeat(32)))[0].result.error,'changed');
      assert.equal((await one(sql`SELECT count(*)::int AS n FROM sketchlet_guest_links`))[0].n,0);
    });
    await t.test('links ownership, hides conflicts, preserves received ratings and reconciles self/duplicate votes',async () => {
      assert.deepEqual((await link(account,guest,revision))[0].result,{linked:1,hidden:1,alreadyLinked:false});
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
