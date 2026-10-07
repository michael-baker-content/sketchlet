import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { publicFile } from '../../backend/public-files.mjs';

const id = '12345678-1234-1234-1234-123456789abc';
const drawing = { id, date: '2026-10-06', prompt: 'laughing kite', mine: true,
  displayName: 'tester', count: 0, average: null, image: '/api/drawings/' + id + '/image', url: '/d/' + id };
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
  await page.locator('#start-rating').click();
  await expect(page.getByRole('heading', { name: 'rating break' })).toBeVisible();
  await page.getByRole('button', { name: 'back to gallery', exact: true }).click();
  await expect(page.locator('.prompt-card')).toHaveCount(1);
  expect(requests).not.toContain('/api/today');
  expectNoEditor(requests);
  expect(errors).toEqual([]);
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
