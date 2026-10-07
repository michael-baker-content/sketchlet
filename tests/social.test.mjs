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
    artwork: async () => sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#ce4949' } }).png().toBuffer(),
    ...overrides,
  });
  return result;
}

test('home and gallery serve social metadata without cookies or database access', async () => {
  for (const path of ['/', '/gallery', '/gallery?view=rate']) {
    const result = await response(path, { drawing: () => assert.fail('no drawing query'), prompt: () => assert.fail('no prompt query') });
    assert.equal(result.status, 200);
    assert.match(result.body, /property="og:image" content="https:\/\/sketchlet.example\/social\//);
    assert.match(result.body, /name="twitter:card" content="summary_large_image"/);
    assert.match(result.body, path === '/' ? /src\/home-page.js/ : /src\/gallery-page.js/);
    assert.doesNotMatch(result.body, /<canvas|src="\/src\/studio.js"/);
    assert.equal(result.headers['Set-Cookie'], undefined);
  }
});

test('old and readable drawing URLs return the same canonical artwork metadata', async () => {
  for (const path of ['/d/' + id, drawingPath(id, row.prompt)]) {
    const result = await response(path);
    assert.equal(result.status, 200);
    assert.match(result.body, /singing kite — Sketchlet/);
    assert.ok(result.body.includes(`href="${origin}${drawingPath(id, row.prompt)}"`));
    assert.ok(result.body.includes(`${origin}/social/drawing/${id}.png`));
    assert.doesNotMatch(result.body, /private-drawing.png|owner_hash/);
  }
});

test('prompt galleries get their own title, canonical URL, and image', async () => {
  const result = await response('/gallery?date=2026-10-02&utm_source=test');
  assert.equal(result.status, 200);
  assert.match(result.body, /singing kite — Sketchlet gallery/);
  assert.match(result.body, /social\/prompt\/2026-10-02.png/);
  assert.doesNotMatch(result.body, /utm_source/);
});

test('untrusted names and prompt text cannot inject HTML metadata', async () => {
  const result = await response('/d/' + id, { drawing: async () => ({ ...row, name: '"><script>alert(1)</script>', prompt: '<img src=x>' }) });
  assert.equal(result.status, 200);
  assert.doesNotMatch(result.body, /<script>alert|<img src=x>/);
  assert.match(result.body, /&lt;script&gt;/);
});

test('social PNGs are public, correctly sized, and contain the saved drawing', async () => {
  for (const path of ['/social/site.png', '/social/gallery.png', '/social/prompt/2026-10-02.png', `/social/drawing/${id}.png`]) {
    const result = await response(path);
    assert.equal(result.status, 200, path);
    assert.equal(result.headers['Content-Type'], 'image/png');
    assert.match(result.headers['Cache-Control'], /public/);
    const meta = await sharp(result.body).metadata();
    assert.equal(meta.width, 1200); assert.equal(meta.height, 630);
    if (path.includes('/drawing/')) {
      const pixel = await sharp(result.body).extract({ left: 100, top: 100, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      assert.deepEqual([...pixel], [206, 73, 73]);
    }
  }
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
