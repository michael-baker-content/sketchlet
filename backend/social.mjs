import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { drawingIdFromPath, drawingPath } from '../src/drawing-links.js';
import { formatPromptDate } from '../src/prompts.js';
import { drawingCaption } from '../src/text-format.js';
import { renderPageShell } from './page-shell.mjs';

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
  const url = origin + meta.path, image = origin + '/social/paintbrush-v1.png';
  return `<title>${escape(meta.title)}</title>
  <meta name="description" content="${escape(meta.description)}">
  <link rel="canonical" href="${escape(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="sketchlet">
  <meta property="og:title" content="${escape(meta.title)}">
  <meta property="og:description" content="a little drawing every day">
  <meta property="og:url" content="${escape(url)}">
  <meta property="og:image" content="${escape(image)}">
  <meta property="og:image:secure_url" content="${escape(image)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta property="og:image:alt" content="sketchlet pixel paintbrush logo">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escape(meta.title)}">
  <meta name="twitter:description" content="a little drawing every day">
  <meta name="twitter:image" content="${escape(image)}">
  <meta name="twitter:image:alt" content="sketchlet pixel paintbrush logo">`;
}

let logo;
export function socialImage() {
  // Reuse the actual favicon, with integer pixel scaling and no artwork access.
  if (!logo) logo = readFile(new URL('../src/assets/favicon.svg', import.meta.url))
    .then(svg => sharp(svg).resize(512, 512, { kernel: 'nearest' }).png().toBuffer())
    .catch(error => { logo = null; throw error; });
  return logo;
}

const defaults = {
  drawing: async id => (await import('./social-data.mjs')).socialDrawing(id),
  prompt: async date => (await import('./social-data.mjs')).socialPrompt(date),
  html: renderPageShell,
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
    if (isImage) {
      // Old image URLs now return the same logo, including artwork-preview URLs
      // previously advertised to crawlers. Never retrieve drawings for previews.
      const known = ['/social/paintbrush-v1.png', '/social/site.png', '/social/gallery.png'].includes(path)
        || (drawingImage && uuid.test(drawingImage)) || (promptImage && dateValid(promptImage));
      if (!known) throw Object.assign(new Error('not found'), { status: 404 });
      const bytes = await socialImage();
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300, s-maxage=3600', 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes); return;
    }
    const id = drawingIdFromPath(path);
    const date = path.replace(/\/$/, '') === '/gallery' ? url.searchParams.get('date') : null;
    let meta = { path: '/', title: 'sketchlet - a little drawing every day',
      description: 'One playful prompt each day. Draw your interpretation, explore the gallery, and rate other doodles.' };
    let row = null;
    if (id) {
      row = await deps.drawing(id);
      if (!row) throw Object.assign(new Error('not found'), { status: 404 });
      const author = row.name || 'someone';
      meta = { path: drawingPath(row.id, row.prompt),
        title: drawingCaption(row.name, row.prompt),
        description: `“${row.prompt}” by ${author}, drawn on ${formatPromptDate(row.date)}. View and rate this drawing on sketchlet.` };
    } else if (date) {
      if (!dateValid(date)) throw Object.assign(new Error('not found'), { status: 404 });
      row = await deps.prompt(date);
      if (!row) throw Object.assign(new Error('not found'), { status: 404 });
      meta = { path: `/gallery?date=${date}`, title: `${row.prompt} - sketchlet gallery`,
        description: `Explore the drawings for “${row.prompt}” on ${formatPromptDate(date)}.` };
    } else if (path === '/gallery' || path === '/gallery/') {
      meta = { ...meta, path: '/gallery', title: 'gallery - sketchlet', description: 'Explore daily drawing prompts and rate the community’s creations on sketchlet.' };
    } else if (path !== '/') {
      throw Object.assign(new Error('not found'), { status: 404 });
    }
    const html = await deps.html(path === '/' ? 'index.html' : 'gallery.html');
    const body = html.replace(/<title>[\s\S]*?<\/title>/, socialTags(meta, origin));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=300' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error.status === 404 ? 404 : 503;
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.end(req.method === 'HEAD' ? undefined : `<!doctype html><html lang="en"><title>sketchlet</title><body><h1>${status === 404 ? 'drawing or gallery not found' : 'temporarily unavailable'}</h1><p><a href="/">back to sketchlet</a></p></body></html>`);
  }
}
