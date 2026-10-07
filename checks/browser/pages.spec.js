import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { publicFile } from '../../backend/public-files.mjs';
import { drawingPath } from '../../src/drawing-links.js';

const id = '12345678-1234-1234-1234-123456789abc';
const drawing = { id, date: '2026-10-06', prompt: 'laughing kite', mine: true,
  displayName: 'tester', count: 0, average: null, image: '/api/drawings/' + id + '/image', url: drawingPath(id, 'laughing kite') };
const today = { date: drawing.date, prompt: drawing.prompt, displayName: 'tester', streak: 1, submission: null };
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

// Serve real page assets in the browser while replacing ALL API traffic.
// No running server, database credentials, or production writes are involved.
async function fixture(page, overrides = {}) {
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.origin !== 'http://sketchlet.test') return route.abort();
    if (overrides[url.pathname]) return overrides[url.pathname](route);
    if (url.pathname.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: pixel });
    const data = {
      '/api/today': today,
      '/api/archive': [{ date: drawing.date, prompt: drawing.prompt, count: 1, image: drawing.image }],
      '/api/gallery': [drawing],
      ['/api/drawings/' + id]: drawing,
      '/api/profile': { displayName: 'tester' },
      '/api/profile/drawings': { drawings: [drawing], next: null },
      '/api/queue': [],
    };
    if (url.pathname in data) return route.fulfill({ json: data[url.pathname] });
    const file = publicFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'not found' });
    const body = await readFile(new URL('../../' + file, import.meta.url));
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)];
    return route.fulfill({ body, contentType });
  });
  return { requests, errors };
}

function expectNoEditor(requests) {
  expect(requests).not.toContain('/src/studio.js');
  expect(requests).not.toContain('/src/editor.html');
  expect(requests).not.toContain('/src/submission.js');
}

test('incremental pencil matches replay pixels over texture, after recovery and erasing', async ({ page }) => {
  await fixture(page);
  await page.goto('/gallery');
  const results = await page.evaluate(async () => {
    const { createBrushRenderer } = await import('/src/brushes.js');
    const { createActivePencilCache } = await import('/src/canvas-cache.js');
    const make = () => { const c = document.createElement('canvas'); c.width = c.height = 160; return c; };
    const draw = createBrushRenderer(make), failures = [];
    let replayGrains = 0, incrementalGrains = 0;
    for (const shape of ['circle', 'square', 'rough']) for (const size of [5,14,32]) {
      const base = make(), live = make(), reference = make();
      const b = base.getContext('2d'), l = live.getContext('2d'), r = reference.getContext('2d');
      const texture = { tool: 'brush', shape, size: 32, style: 'pencil', seed: 19, color: '#663399', points: [[20,20],[140,140],[20,140],[140,20]] };
      draw(b, texture);
      const strokes = [texture];
      const cache = createActivePencilCache(l, 160, draw);
      const stroke = { ...texture, size, seed: 27, color: '#112233', points: [] };
      const oldLiveFill = l.fillRect.bind(l), oldReplayFill = r.fillRect.bind(r);
      l.fillRect = (...args) => { incrementalGrains++; oldLiveFill(...args); };
      r.fillRect = (...args) => { replayGrains++; oldReplayFill(...args); };
      function compare(label) {
        const a = l.getImageData(0,0,160,160).data, b = r.getImageData(0,0,160,160).data;
        if (a.some((value, index) => value !== b[index])) failures.push(`${shape}/${size}/${label}`);
      }
      for (let i = 0; i < 24; i++) {
        stroke.points.push([25 + (i % 8) * 15, 75 + Math.sin(i) * 40]);
        cache.sync(stroke, strokes, base);
        r.clearRect(0,0,160,160); r.drawImage(base,0,0); draw(r,stroke);
        compare(`frame ${i}`);
        cache.sync(stroke, strokes, base); compare('unchanged');
      }
      cache.invalidate(); l.clearRect(0,0,160,160);
      cache.sync(stroke, strokes, base); compare('recovery');
      const erase = { ...stroke, tool: 'eraser', points: [[20,80],[140,80]] };
      draw(l,erase); draw(r,erase); compare('erase');
    }
    return { failures, replayGrains, incrementalGrains };
  });
  expect(results.failures).toEqual([]);
  expect(results.incrementalGrains).toBeLessThan(results.replayGrains / 4);
});

test('gallery reload never requests the editor or today, even when today is unavailable', async ({ page }) => {
  const { requests, errors } = await fixture(page, { '/api/today': route => route.fulfill({ status: 503, json: { error: 'offline' } }) });
  for (let pass = 0; pass < 2; pass++) {
    if (pass) await page.reload(); else await page.goto('/gallery');
    await expect(page.locator('.prompt-card')).toHaveCount(1);
    await expect(page.locator('canvas,.studio,.submit-bar')).toHaveCount(0);
  }
  expect(requests).not.toContain('/api/today');
  expectNoEditor(requests);
  expect(errors).toEqual([]);
});

test('completed home displays the submission without fetching editor assets', async ({ page }) => {
  const { requests, errors } = await fixture(page, { '/api/today': route => route.fulfill({ json: { ...today, submission: drawing } }) });
  await page.goto('/');
  await expect(page.locator('.finished-drawing')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expectNoEditor(requests);
  expect(errors).toEqual([]);
});

test('home waits for status, then mounts working normal and full-screen tools', async ({ page }) => {
  let release;
  const status = new Promise(resolve => { release = resolve; });
  const { requests, errors } = await fixture(page, { '/api/today': async route => { await status; await route.fulfill({ json: today }); } });
  await page.goto('/');
  await expect(page.locator('#page-content')).toContainText('loading');
  expectNoEditor(requests);
  release();
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#review-drawing')).toBeEnabled();
  await expect(page.locator('#download')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.focus-launch').click();
  await expect(page.locator('.drawing-focus')).toBeVisible();
  await expect(page.locator('.drawing-focus #canvas')).toBeVisible();
  await page.locator('.focus-close').click();
  await expect(page.locator('.studio #canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tool choices and background history stay synchronized across desktop and full screen', async ({ page }) => {
  const { errors } = await fixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  await page.locator('#brush-shape').selectOption('rough');
  await page.locator('#brush-style').selectOption('pencil');
  await page.locator('[data-size="32"]').click();
  await page.locator('#eraser').click();
  await expect(page.locator('#brush-style')).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.focus-launch').click();
  await expect(page.locator('[data-focus="tool"]')).toHaveValue('eraser');
  await expect(page.locator('[data-focus="shape"]')).toHaveValue('rough');
  await expect(page.locator('[data-focus="size"]')).toHaveValue('32');
  await expect(page.locator('[data-focus="style"]')).toHaveValue('pencil');
  await expect(page.locator('[data-focus="style"]')).toBeDisabled();
  await page.locator('[data-color-menu="color"]').click();
  await page.locator('.color-menu-option[data-color="#24365B"]').click();
  await expect(page.locator('[data-focus="tool"]')).toHaveValue('brush');
  await expect(page.locator('[data-focus="style"]')).toBeEnabled();
  await page.locator('[data-focus="size"]').selectOption('5');
  await page.locator('[data-focus="shape"]').selectOption('square');
  await page.locator('[data-color-menu="background"]').click();
  await page.locator('.color-menu-option[data-color="#FFF3D2"]').click();
  await expect(page.locator('[data-color-menu="background"]')).toHaveAttribute('aria-label', 'background: cream');
  await page.locator('#undo').click();
  await expect(page.locator('[data-color-menu="background"]')).toHaveAttribute('aria-label', 'background: paper');
  await page.locator('#redo').click();
  await page.locator('.focus-close').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#brush')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#brush-shape')).toHaveValue('square');
  await expect(page.locator('[data-size="5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#palette').locator('..').locator('summary')).toHaveAttribute('aria-label', 'color: navy');
  await expect(page.locator('#background-palette').locator('..').locator('summary')).toHaveAttribute('aria-label', 'background: cream');
  expect(errors).toEqual([]);
});

test('coalesced drawing measures canvas once per event after layout changes', async ({ page }) => {
  const { errors } = await fixture(page);
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  const canvas = page.locator('#canvas');
  for (const width of [390, 760]) {
    await page.setViewportSize({ width, height: 1000 });
    await canvas.scrollIntoViewIfNeeded();
    await canvas.evaluate(element => element.addEventListener('pointerdown', event => {
      element.testPointerId = event.pointerId;
    }, { once: true }));
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .2);
    await page.mouse.down();
    const reads = await canvas.evaluate(element => {
      const original = element.getBoundingClientRect;
      const rect = original.call(element);
      let count = 0;
      element.getBoundingClientRect = () => { count++; return original.call(element); };
      try {
        const samples = Array.from({ length: 20 }, (_, i) => ({
          clientX: rect.left + rect.width * (.2 + i / 100),
          clientY: rect.top + rect.height * (.2 + i / 100),
        }));
        const event = new PointerEvent('pointermove', { ...samples.at(-1), pointerId: element.testPointerId, pointerType: 'mouse', isPrimary: true });
        Object.defineProperty(event, 'getCoalescedEvents', { value: () => samples });
        element.dispatchEvent(event);
        return count;
      } finally { element.getBoundingClientRect = original; }
    });
    await page.mouse.up();
    expect(reads).toBe(1);
    await expect(page.locator('#undo')).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('landscape full-screen cutoff preserves the drawing, undo, and normal scrolling', async ({ page }) => {
  const { errors } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  await page.locator('.focus-launch').click();
  const canvas = page.locator('#canvas');
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .7, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#undo')).toBeEnabled();
  const pixels = await canvas.evaluate(element => element.toDataURL());
  await page.locator('.drawing-focus [data-color-menu="color"]').click();
  await expect(page.locator('.color-menu')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.drawing-focus')).not.toBeVisible();
  await expect(page.locator('.color-menu')).not.toBeVisible();
  await expect(page.locator('.focus-launch')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/drawing-focused/);
  await expect(page.locator('.studio #canvas')).toBeVisible();
  expect(await canvas.evaluate(element => element.toDataURL())).toBe(pixels);
  await page.locator('#undo').click();
  expect(await canvas.evaluate(element => element.toDataURL())).not.toBe(pixels);
  await page.setViewportSize({ width: 1100, height: 500 });
  await expect(page.locator('.focus-launch')).toBeHidden();
  await page.setViewportSize({ width: 1101, height: 500 });
  await expect(page.locator('.focus-launch')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.focus-launch')).toBeVisible();
  await page.locator('.focus-launch').click();
  await expect(page.locator('.drawing-focus')).toBeVisible();
  expect(errors).toEqual([]);
});

test('status failure leaves a retry action and no editor', async ({ page }) => {
  const { requests, errors } = await fixture(page, { '/api/today': route => route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } }) });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'try again' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expectNoEditor(requests);
  expect(errors).toEqual([]);
});

test('shared drawing and rating break load without today or editor', async ({ page }) => {
  const { requests, errors } = await fixture(page);
  await page.goto('/d/' + id);
  await expect(page.locator('.finished-drawing')).toBeVisible();
  await expect(page).toHaveURL('http://sketchlet.test' + drawing.url);
  await page.locator('#start-rating').click();
  await expect(page.getByRole('heading', { name: 'rating break' })).toBeVisible();
  await page.getByRole('button', { name: 'back to gallery', exact: true }).click();
  await expect(page.locator('.prompt-card')).toHaveCount(1);
  expect(requests).not.toContain('/api/today');
  expectNoEditor(requests);
  expect(errors).toEqual([]);
});

test('readable drawing link survives reload and copy shares its canonical address', async ({ page }) => {
  const { errors } = await fixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.copiedDrawingLink = value; },
    } });
  });
  await page.goto(drawing.url);
  await expect(page.locator('.finished-drawing')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'copy link', exact: true }).click();
  await expect(page.locator('#share-status')).toHaveText('link copied!');
  expect(await page.evaluate(() => window.copiedDrawingLink)).toBe('http://sketchlet.test' + drawing.url);
  await expect(page.locator('.share-link')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  const copy = await page.locator('#copy-drawing-link').boundingBox();
  const card = await page.locator('#share-drawing-card').boundingBox();
  expect(Math.abs(copy.y - card.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('blocked clipboard leaves an accessible fallback and working rating action', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('blocked'); },
    } });
  });
  await page.goto(drawing.url);
  await page.getByRole('button', { name: 'copy link', exact: true }).click();
  await expect(page.locator('#share-status a')).toHaveAttribute('href', 'http://sketchlet.test' + drawing.url);
  await expect(page.locator('#copy-drawing-link')).toBeEnabled();
  await expect(page.locator('#start-rating')).toBeEnabled();
});

test('share card is lazy, produces a PNG, and copies the prepared image', async ({ page }) => {
  const { requests, errors } = await fixture(page);
  await page.addInitScript(() => {
    window.ClipboardItem = class {
      constructor(data) { this.data = data; }
      static supports() { return true; }
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async items => {
        const blob = items[0].data['image/png'];
        window.copiedCardType = blob.type;
        window.copiedCardSize = blob.size;
      },
    } });
  });
  await page.goto(drawing.url);
  await expect(page.locator('.finished-drawing')).toBeVisible();
  expect(requests).not.toContain('/src/share-card.js');
  await page.getByRole('button', { name: 'share card', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'share card' });
  await expect(dialog.locator('.share-card-preview')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'copy image' })).toBeEnabled();
  const dimensions = await dialog.locator('img').evaluate(async image => { await image.decode(); return [image.naturalWidth, image.naturalHeight]; });
  expect(dimensions).toEqual([1200, 920]);
  await dialog.getByRole('button', { name: 'copy image' }).click();
  await expect(dialog.getByRole('status')).toContainText('image copied!');
  expect(await page.evaluate(() => window.copiedCardType)).toBe('image/png');
  expect(await page.evaluate(() => window.copiedCardSize)).toBeGreaterThan(1000);
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'download png' }).click();
  expect((await downloaded).suggestedFilename()).toBe('sketchlet-2026-10-06-laughing-kite.png');
  await dialog.getByRole('button', { name: 'close share card' }).click();
  await expect(dialog).toHaveCount(0);
  expectNoEditor(requests);
  expect(errors).toEqual([]);
});

test('share card offers download when image copying is unsupported', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await page.goto(drawing.url);
  await page.getByRole('button', { name: 'share card', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'share card' });
  await expect(dialog.getByRole('link', { name: 'download png' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'copy image' })).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('unavailable');
});

test('failed card generation can be retried without affecting the drawing', async ({ page }) => {
  let fail = true;
  await fixture(page, { [drawing.image]: route => fail
    ? route.fulfill({ status: 503, body: 'unavailable' })
    : route.fulfill({ contentType: 'image/png', body: pixel }) });
  await page.goto(drawing.url);
  await page.getByRole('button', { name: 'share card', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'share card' });
  await expect(dialog.getByRole('button', { name: 'try again' })).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'try again' }).click();
  await expect(dialog.locator('img')).toBeVisible();
  await dialog.getByRole('button', { name: 'close share card' }).click();
  await expect(page.locator('#start-rating')).toBeVisible();
});

test('leaving a delayed gallery view prevents stale content from replacing the new view', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { errors } = await fixture(page, { '/api/gallery': async route => {
    await pending;
    await route.fulfill({ json: [drawing] }).catch(() => {});
  } });
  await page.goto('/gallery');
  await page.locator('.prompt-card').click();
  await expect(page.locator('#page-content')).toContainText('loading');
  await page.locator('#open-archive').click();
  await expect(page.locator('.prompt-card')).toHaveCount(1);
  release();
  await page.goBack();
  await expect(page.locator('[data-id]')).toHaveCount(1);
  await page.goForward();
  await expect(page.locator('.prompt-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});
