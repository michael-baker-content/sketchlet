import { MAX_REQUEST_BYTES } from '../src/upload-limits.js';
export function httpError(status, message) { return Object.assign(new Error(message), { status }); }
export async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw httpError(415, 'expected a JSON request');
  let value;
  // Vercel supplies a parsed body; the standalone server supplies a raw stream.
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) throw httpError(413, 'drawing is too large to upload');
    try { value = JSON.parse(raw); } catch { throw httpError(400, 'invalid request'); }
  } else {
    let length = 0; const chunks = [];
    for await (const chunk of req) { const bytes=Buffer.from(chunk);length+=bytes.length;if(length>MAX_REQUEST_BYTES)throw httpError(413,'drawing is too large to upload');chunks.push(bytes); }
    try { value=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400,'invalid request'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400,'invalid request');
  return value;
}
export function allowedOrigins(env=process.env) {
  const origins=new Set();
  if(env.APP_ORIGIN)origins.add(new URL(env.APP_ORIGIN).origin);
  if(env.VERCEL){
    for(const hostname of [env.VERCEL_URL,env.VERCEL_BRANCH_URL,env.VERCEL_ENV==='production'?env.VERCEL_PROJECT_PRODUCTION_URL:null]){
      if(hostname)origins.add(new URL(`https://${hostname}`).origin);
    }
  }else if(!env.APP_ORIGIN)origins.add('http://localhost:5173');
  return origins;
}
