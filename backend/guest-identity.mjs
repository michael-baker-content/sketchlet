import { createHash, randomBytes } from 'node:crypto';

// Only the server-issued cookie proves possession of guest work.
export function guestOwner(req) {
  const token = (req.headers.cookie || '').match(/(?:^|;\s*)sketchlet_guest=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token ? createHash('sha256').update(token).digest('hex') : null;
}

export function guestVisitor(req, res, secure, rotate = false) {
  const existing = !rotate && guestOwner(req);
  if (existing) return existing;
  const token = randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', `sketchlet_guest=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure ? '; Secure' : ''}`);
  return createHash('sha256').update(token).digest('hex');
}
