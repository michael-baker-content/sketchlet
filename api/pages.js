import { handlePublicPage } from '../backend/social.mjs';

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const request = new URL(req.url, 'http://localhost');
  const path = req.query?.__page ?? request.searchParams.get('__page');
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)) {
    res.writeHead(404); res.end(); return;
  }
  request.pathname = path;
  request.searchParams.delete('__page');
  await handlePublicPage(req, res, request);
}
