import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export function requireRatingName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw Object.assign(new Error('add a name to your profile before rating drawings'), { status: 403, code: 'name_required' });
  }
}
export function validateVote(name, owner, drawingOwner, stars) {
  requireRatingName(name);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw Object.assign(new Error('choose 1–5 stars'), { status: 400 });
  if (owner === drawingOwner) throw Object.assign(new Error('you cannot rate your own drawing'), { status: 403 });
}
export function networkLimitKey(req, env = process.env) {
  // Vercel overwrites this header. Outside Vercel, trust only the socket.
  const raw = env.VERCEL ? req.headers['x-forwarded-for'] : req.socket?.remoteAddress;
  let ip = typeof raw === 'string' ? raw.split(',')[0].trim() : '';
  if (!isIP(ip)) return null;
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (isIP(ip) === 6) ip = new URL(`http://[${ip}]/`).hostname;
  return 'network:' + createHash('sha256').update(ip).digest('hex');
}
export function parseSkipped(value) {
  const ids = value ? value.split(',') : [];
  if (ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))) {
    throw Object.assign(new Error('invalid skipped drawings'), { status: 400 });
  }
  return [...new Set(ids)];
}
export function balanceRatingQueue(items, today) {
  const low = list => [...list].sort((a,b) => a.count-b.count || a.lottery-b.lottery);
  const favorites = [...items].sort((a,b) => ((b.average || 0)*b.count/(b.count+5))-((a.average || 0)*a.count/(a.count+5)) || a.lottery-b.lottery);
  const current = low(items.filter(item => item.date === today));
  const archive = low(items.filter(item => item.date !== today));
  const pools = [current, archive, current, favorites], used = new Set(), result = [];
  while (result.length < items.length) {
    const preferred = pools[result.length % pools.length];
    const item = preferred.find(item => !used.has(item.id)) || [...current, ...archive].find(item => !used.has(item.id));
    if (!item) break;
    used.add(item.id); result.push(item);
  }
  return result;
}
