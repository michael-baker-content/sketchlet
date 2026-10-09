import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { handlePublicPage, publicOrigin } from '../backend/social.mjs';
import { drawingPath } from '../src/drawing-links.js';

const id = '12345678-1234-1234-1234-123456789abc';
const row = { id, prompt: 'singing kite', date: '2026-10-02', name: 'artist', object_key: 'private-drawing.png' };
const origin = 'https://sketchlet.example';
async function response(path, overrides = {}, method = 'GET') {
  const result = {};
  await handlePublicPage({ method }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = body; },
  }, new URL(path, origin), {
    origin,
    drawing: async found => found === id ? row : null,
    prompt: async date => date === row.date ? { ...row, count: 3 } : null,
    artwork: () => assert.fail('link previews must never fetch artwork'),
    ...overrides,
  });
  return result;
}

test('admin page is an uncached, unindexed shell without editor, guest profile, or private data', async () => {
  const result = await response('/admin', {
    drawing:() => assert.fail('no drawing query'), prompt:() => assert.fail('no prompt query'),
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(result.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(result.headers['Referrer-Policy'], 'same-origin');
  assert.match(result.body, /src\/admin-page.js/);
  assert.doesNotMatch(result.body, /src\/home-page.js|src\/gallery-page.js|<canvas|github_login|csrf|client_secret/);
});

test('home and gallery serve social metadata without cookies or database access', async () => {
  for (const path of ['/', '/gallery', '/gallery?view=rate']) {
    const result = await response(path, { drawing: () => assert.fail('no drawing query'), prompt: () => assert.fail('no prompt query') });
    assert.equal(result.status, 200);
    assert.match(result.body, /property="og:image" content="https:\/\/sketchlet.example\/social\//);
    assert.match(result.body, /name="twitter:card" content="summary"/);
    assert.match(result.body, /property="og:description" content="a little drawing every day"/);
    if (path === '/') assert.match(result.body, /<title>sketchlet - a little drawing every day<\/title>/);
    assert.match(result.body, path === '/' ? /src\/home-page.js/ : /src\/gallery-page.js/);
    assert.doesNotMatch(result.body, path === '/' ? /src\/gallery-page.js/ : /src\/home-page.js/);
    assert.equal((result.body.match(/<script type="module"/g) || []).length, 1);
    assert.equal((result.body.match(/id="page-loader"/g) || []).length, 1);
    assert.doesNotMatch(result.body, /\$\{page\./);
    assert.doesNotMatch(result.body, /<canvas|src="\/src\/studio.js"/);
    assert.equal(result.headers['Set-Cookie'], undefined);
  }
});

test('old and readable drawing URLs credit the creator and advertise only the logo', async () => {
  for (const path of ['/d/' + id, drawingPath(id, row.prompt)]) {
    const result = await response(path);
    assert.equal(result.status, 200);
    assert.match(result.body, /artist drew a singing kite on sketchlet/);
    assert.ok(result.body.includes(`href="${origin}${drawingPath(id, row.prompt)}"`));
    assert.ok(result.body.includes(`${origin}/social/paintbrush-v1.png`));
    assert.doesNotMatch(result.body, /social\/drawing\//);
    assert.doesNotMatch(result.body, /private-drawing.png|owner_hash/);
  }
});

test('prompt galleries get their own title and canonical URL with the shared logo', async () => {
  const result = await response('/gallery?date=2026-10-02&utm_source=test');
  assert.equal(result.status, 200);
  assert.match(result.body, /singing kite - sketchlet gallery/);
  assert.match(result.body, /social\/paintbrush-v1.png/);
  assert.doesNotMatch(result.body, /utm_source/);
});

test('untrusted names and prompt text cannot inject HTML metadata', async () => {
  const result = await response('/d/' + id, { drawing: async () => ({ ...row, name: '"><script>alert(1)</script>', prompt: '<img src=x>' }) });
  assert.equal(result.status, 200);
  assert.doesNotMatch(result.body, /<script>alert|<img src=x>/);
  assert.match(result.body, /&lt;script&gt;/);
});

test('all social PNG URLs return the same square favicon without database or storage access', async () => {
  let expected;
  for (const path of ['/social/paintbrush-v1.png', '/social/site.png', '/social/gallery.png', '/social/prompt/2026-10-02.png', `/social/drawing/${id}.png`]) {
    const result = await response(path, { drawing: () => assert.fail('no drawing query'), prompt: () => assert.fail('no prompt query') });
    assert.equal(result.status, 200, path);
    assert.equal(result.headers['Content-Type'], 'image/png');
    assert.match(result.headers['Cache-Control'], /public/);
    const meta = await sharp(result.body).metadata();
    assert.equal(meta.width, 512); assert.equal(meta.height, 512);
    if (expected) assert.deepEqual(result.body, expected);
    expected = result.body;
  }
});

test('anonymous drawing links use someone rather than the sender identity', async () => {
  const result = await response('/d/' + id, { drawing: async () => ({ ...row, name: null }) });
  assert.match(result.body, /someone drew a singing kite on sketchlet/);
});

test('removed drawing links reveal no creator metadata and public drawing pages cannot be cached', async () => {
  const hidden = await response('/d/' + id, { drawing:async () => null });
  assert.equal(hidden.status,404);
  assert.doesNotMatch(hidden.body,/artist|singing kite|private-drawing/);
  const visible = await response('/d/' + id);
  assert.equal(visible.headers['Cache-Control'],'private, no-store');
});

test('missing or invalid public resources return 404, outages return noncacheable 503', async () => {
  for (const path of ['/d/not-a-drawing', '/gallery?date=2026-02-30', '/gallery?date=2020-01-01', '/social/drawing/not-an-id.png']) {
    assert.equal((await response(path)).status, 404, path);
  }
  const failed = await response('/d/' + id, { drawing: async () => { throw new Error('offline'); } });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers['Cache-Control'], 'no-store');
  assert.equal((await response('/', {}, 'HEAD')).body, undefined);
  assert.equal((await response('/', {}, 'POST')).status, 405);
  assert.match((await response('/robots.txt')).body, /Allow: \//);
});

test('public origin is configured rather than derived from incoming host headers', () => {
  assert.equal(publicOrigin({ APP_ORIGIN: origin }), origin);
  assert.equal(publicOrigin({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'sketchlet-blush.vercel.app' }), 'https://sketchlet-blush.vercel.app');
  assert.throws(() => publicOrigin({ APP_ORIGIN: 'https://user:password@example.com' }));
  assert.throws(() => publicOrigin({ APP_ORIGIN: 'https://example.com/path' }));
});
