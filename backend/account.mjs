import { randomBytes, randomUUID } from 'node:crypto';
import { createAccountHandler, createOwnerResolver } from './account-auth.mjs';

let store;
async function getStore() {
  if (store) return store;
  if (!process.env.DATABASE_URL) throw new Error('Missing database configuration');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  store = {
    async preview(accountId, guest) {
      const [claim] = await sql`SELECT account_id FROM sketchlet_guest_links WHERE guest_hash=${guest}`;
      if (claim) return {drawings:[],claimed:true};
      const [row] = await sql`SELECT plan AS drawings,md5(plan::text) AS revision
        FROM (SELECT sketchlet_guest_plan(${accountId},${guest}) AS plan) p`;
      return row;
    },
    async link(accountId, guest, revision) {
      const [row] = await sql`SELECT sketchlet_link_guest(${accountId},${guest},${revision}) AS result`;
      return row.result;
    },
    async retired(guest) {
      const rows = await sql`SELECT 1 FROM sketchlet_guest_links WHERE guest_hash=${guest}`;
      return rows.length > 0;
    },
    async find(instance, userId) {
      const [row] = await sql`SELECT id,owner_hash FROM sketchlet_accounts WHERE clerk_instance=${instance} AND clerk_user_id=${userId}`;
      return row;
    },
    async register(instance, userId) {
      // Stable internal identity stays independent of the authentication vendor.
      const [row] = await sql`INSERT INTO sketchlet_accounts(id,clerk_instance,clerk_user_id,owner_hash)
        VALUES (${randomUUID()},${instance},${userId},${randomBytes(32).toString('hex')})
        ON CONFLICT(clerk_instance,clerk_user_id) DO UPDATE SET clerk_user_id=EXCLUDED.clerk_user_id
        RETURNING id`;
      return row;
    },
  };
  return store;
}

export const handleAccount = createAccountHandler({ getStore });

export const resolveOwner = createOwnerResolver({getStore});
