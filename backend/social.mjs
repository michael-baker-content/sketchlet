import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { drawingIdFromPath, drawingPath } from '../src/drawing-links.js';
import { formatPromptDate } from '../src/prompts.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function publicOrigin(env = process.env) {
  const value = env.APP_ORIGIN || (env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL ? 'https://sketchlet-blush.vercel.app' : 'http://localhost:5173');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid APP_ORIGIN');
  return url.origin;
}

export function socialTags(meta, origin) {
  const url = origin + meta.path, image = origin + meta.image;
  return `<title>${escape(meta.title)}</title>
  <meta name="description" content="${escape(meta.description)}">
  <link rel="canonical" href="${escape(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Sketchlet">
  <meta property="og:title" content="${escape(meta.title)}">
  <meta property="og:description" content="${escape(meta.description)}">
  <meta property="og:url" content="${escape(url)}">
  <meta property="og:image" content="${escape(image)}">
  <meta property="og:image:secure_url" content="${escape(image)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escape(meta.alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(meta.title)}">
  <meta name="twitter:description" content="${escape(meta.description)}">
  <meta name="twitter:image" content="${escape(image)}">
  <meta name="twitter:image:alt" content="${escape(meta.alt)}">`;
}

function lines(value, length = 24) {
  const result = []; let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (line && (line + ' ' + word).length > length) { result.push(line); line = ''; }
    line += (line ? ' ' : '') + word;
  }
  if (line) result.push(line);
  return result.slice(0, 3).map(text => text.length > length ? text.slice(0, length - 1) + '…' : text);
}
export async function socialImage(meta, artwork, origin) {
  const hasArt = !!artwork, x = hasArt ? 600 : 80;
  const title = lines(meta.heading, hasArt ? 23 : 36);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><pattern id="checks" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#d6c6ec"/><path d="M0 0h8v8H0zM8 8h8v8H8z" fill="#ffffff" opacity=".15"/></pattern></defs>
    <rect width="1200" height="630" fill="url(#checks)"/>
    <rect x="24" y="24" width="1152" height="582" fill="#e7d9f5"/>
    <path d="M24 606V24h1152" stroke="white" stroke-width="5" fill="none"/>
    <path d="M1176 24v582H24" stroke="#675c72" stroke-width="5" fill="none"/>
    <g font-family="sans-serif" fill="#32124f">
      <text x="${x}" y="${hasArt ? 117 : 133}" font-size="62" font-weight="bold" fill="#663399">sketchlet</text>
      ${title.map((line, i) => `<text x="${x}" y="${230 + i * 57}" font-size="44" font-weight="bold">${escape(line)}</text>`).join('')}
      <text x="${x}" y="449" font-size="27">${escape(meta.byline || 'a drawing a day')}</text>
      <text x="${x}" y="492" font-size="25">${escape(meta.date ? formatPromptDate(meta.date) : 'draw · share · rate')}</text>
      <text x="${x}" y="559" font-size="24">${escape(new URL(origin).host)}</text>
    </g>
  </svg>`;
  const base = sharp(Buffer.from(svg));
  if (artwork) {
    const resized = await sharp(artwork).resize(500, 500, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    base.composite([{ input: resized, left: 60, top: 65 }]);
  }
  return base.png().toBuffer();
}

const defaults = {
  drawing: async id => (await import('./social-data.mjs')).socialDrawing(id),
  prompt: async date => (await import('./social-data.mjs')).socialPrompt(date),
  artwork: async key => (await import('./social-data.mjs')).socialArtwork(key),
  html: file => readFile(new URL('../' + file, import.meta.url), 'utf8'),
};

export async function handlePublicPage(req, res, url, dependencies = {}) {
  const deps = { ...defaults, ...dependencies };
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const origin = dependencies.origin || publicOrigin();
    const path = url.pathname;
    if (path === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : 'User-agent: *\nAllow: /\n'); return;
    }
    const drawingImage = path.match(/^\/social\/drawing\/([^/]+)\.png$/)?.[1];
    const promptImage = path.match(/^\/social\/prompt\/(\d{4}-\d{2}-\d{2})\.png$/)?.[1];
    const isImage = path.startsWith('/social/');
    const id = drawingImage ? (uuid.test(drawingImage) ? drawingImage : null) : drawingIdFromPath(path);
    const date = promptImage || (path.replace(/\/$/, '') === '/gallery' ? url.searchParams.get('date') : null);
    let meta = { path: '/', image: '/social/site.png', title: 'Sketchlet — a drawing a day', heading: 'one prompt. your drawing.',
      description: 'Draw a daily prompt, share your creation, and discover and rate drawings from the community.', alt: 'Sketchlet — a drawing a day' };
    let row = null;
    if (id) {
      row = await deps.drawing(id);
      if (!row) throw Object.assign(new Error('not found'), { status: 404 });
      const author = row.name || 'anonymous';
      meta = { path: drawingPath(row.id, row.prompt), image: `/social/drawing/${row.id}.png`,
        title: `${row.prompt} — Sketchlet`, heading: row.prompt, byline: `by ${author}`.slice(0, 37), date: row.date,
        description: `“${row.prompt}” by ${author}, drawn on ${formatPromptDate(row.date)}. View and rate this drawing on Sketchlet.`,
        alt: `Drawing of ${row.prompt} by ${author}, with Sketchlet branding.` };
    } else if (date) {
      if (!dateValid(date)) throw Object.assign(new Error('not found'), { status: 404 });
      row = await deps.prompt(date);
      if (!row) throw Object.assign(new Error('not found'), { status: 404 });
      meta = { path: `/gallery?date=${date}`, image: `/social/prompt/${date}.png`, title: `${row.prompt} — Sketchlet gallery`, heading: row.prompt,
        date, byline: `${row.count} ${row.count === 1 ? 'drawing' : 'drawings'}`, description: `Explore the drawings for “${row.prompt}” on ${formatPromptDate(date)}.`, alt: `Sketchlet gallery for ${row.prompt}, ${formatPromptDate(date)}.` };
    } else if (path === '/gallery' || path === '/gallery/' || path === '/social/gallery.png') {
      meta = { ...meta, path: '/gallery', image: '/social/gallery.png', title: 'Drawing gallery — Sketchlet', heading: 'the sketchlet gallery', description: 'Explore daily drawing prompts and rate the community’s creations on Sketchlet.' };
    } else if (path !== '/' && path !== '/social/site.png') {
      throw Object.assign(new Error('not found'), { status: 404 });
    }
    if (isImage) {
      const bytes = await socialImage(meta, id ? await deps.artwork(row.object_key) : null, origin);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300, s-maxage=3600', 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes); return;
    }
    const html = await deps.html(path === '/' ? 'index.html' : 'gallery.html');
    const body = html.replace(/<title>[\s\S]*?<\/title>/, socialTags(meta, origin));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=300' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error.status === 404 ? 404 : 503;
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.end(req.method === 'HEAD' ? undefined : `<!doctype html><html lang="en"><title>Sketchlet</title><body><h1>${status === 404 ? 'drawing or gallery not found' : 'temporarily unavailable'}</h1><p><a href="/">back to sketchlet</a></p></body></html>`);
  }
}
