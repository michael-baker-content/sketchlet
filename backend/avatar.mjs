import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readJson, httpError } from './http.mjs';

export async function handleAvatar(req, res, {sql,storage,bucket,owner}) {
  if (!req.headers.authorization) throw httpError(401,'please sign in to use an account photo');
  const [account] = await sql`SELECT id,avatar_key FROM sketchlet_accounts WHERE owner_hash=${owner}`;
  if (!account) throw httpError(403,'please sign in to use an account photo');
  let photo = null;
  if (req.method === 'POST') {
    const input = await readJson(req);
    let key = null;
    if (input.photo !== null) {
      if (typeof input.photo !== 'string' || input.photo.length > 200000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo)) throw httpError(400,'choose a smaller profile photo');
      let bytes;
      try {
        bytes = await sharp(Buffer.from(input.photo.split(',')[1],'base64'),{limitInputPixels:1000000}).rotate().resize(256,256,{fit:'cover'}).flatten({background:'#fff'}).jpeg({quality:85}).toBuffer();
      } catch { throw httpError(400,'could not read this profile photo'); }
      key = `avatars/${account.id}/${randomUUID()}.jpg`;
      await storage.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:'image/jpeg'}));
      photo = 'data:image/jpeg;base64,' + bytes.toString('base64');
    }
    // Do not delete a newly uploaded object on an ambiguous database failure.
    await sql`UPDATE sketchlet_accounts SET avatar_key=${key} WHERE id=${account.id}`;
    if (account.avatar_key) {
      try { await storage.send(new DeleteObjectCommand({Bucket:bucket,Key:account.avatar_key})); }
      catch { console.error('Old avatar cleanup failed; reconcile private storage.'); }
    }
  } else if (account.avatar_key) {
    const object = await storage.send(new GetObjectCommand({Bucket:bucket,Key:account.avatar_key}));
    photo = 'data:image/jpeg;base64,' + Buffer.from(await object.Body.transformToByteArray()).toString('base64');
  }
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'private, no-store'});
  res.end(JSON.stringify({photo}));
}
