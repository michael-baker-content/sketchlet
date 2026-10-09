import './env.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { publicFile } from './public-files.mjs';
import { handlePublicPage } from './social.mjs';
import { handleAdmin } from './admin.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const configured = ['DATABASE_URL', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].every(key => !!process.env[key]);
let api;
try { if (configured) api = (await import('./api.mjs')).handleApi; }
catch { console.error('Gallery dependencies could not load. Install the packages listed in README.md, then restart.'); }
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
      await handleAdmin(req, res, pathname); return;
    }
    if (pathname === '/admin' || pathname === '/admin/') { await handlePublicPage(req, res, url); return; }
    if (pathname === '/admin.html') { res.writeHead(308, { Location:'/admin' }); res.end(); return; }
    if (pathname === '/' || pathname === '/gallery' || pathname === '/gallery/' || pathname.startsWith('/d/') || pathname.startsWith('/social/') || pathname === '/robots.txt') {
      await handlePublicPage(req, res, url); return;
    }
    if (pathname === '/index.html' || pathname === '/gallery.html') {
      res.writeHead(308, { Location: pathname === '/index.html' ? '/' : '/gallery' }); res.end(); return;
    }
    if (pathname.startsWith('/api/')) {
      if (!api) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'gallery setup is incomplete. your local draft is safe.' })); return; }
      await api(req, res, pathname); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = publicFile(pathname);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(new URL(`../${file}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { if (!res.headersSent) res.writeHead(500); res.end('Request failed'); }
}).listen(Number(process.env.PORT || 5173), process.env.HOST || '127.0.0.1', () => console.log('Sketchlet is ready at http://localhost:' + (process.env.PORT || 5173)));
