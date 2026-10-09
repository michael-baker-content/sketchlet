import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { publicFile } from '../../backend/public-files.mjs';
import { renderPageShell } from '../../backend/page-shell.mjs';
import { handlePublicPage } from '../../backend/social.mjs';
import { createAdminHandler } from '../../backend/admin-auth.mjs';
import { drawingPath } from '../../src/drawing-links.js';

const id = '12345678-1234-1234-1234-123456789abc';
const drawing = { id, date: '2026-10-06', prompt: 'laughing kite', mine: true,
  displayName: 'tester', count: 0, average: null, image: '/api/drawings/' + id + '/image', url: drawingPath(id, 'laughing kite') };
const today = { date: drawing.date, prompt: drawing.prompt, displayName: 'tester', streak: 1, submission: null };
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

// Serve real page assets in the browser while replacing ALL API traffic.
// No running server, database credentials, or production writes are involved.
async function fixture(page, overrides = {}, { emptyDraft = false } = {}) {
  // Existing editor tests represent a returning artist. Fresh-day tests opt out.
  await page.addInitScript(({ day, emptyDraft }) => {
    window.fixtureDraftReady = new Promise((resolve, reject) => {
      const request = indexedDB.open('little-canvas', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (emptyDraft) { db.close(); resolve(); return; }
        const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
        const key = `prompt-v2:${day}`, existing = store.get(key);
        existing.onsuccess = () => {
          if (!existing.result) store.put({ day, document: { background: '#FFFFFF', strokes: [
            { tool: 'brush', style: 'brush', shape: 'circle', size: 5, color: '#343044', points: [[0,0]] },
          ] } }, key);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { day: today.date, emptyDraft });
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.origin !== 'http://sketchlet.test') return route.abort();
    if (url.pathname === '/api/today') await page.evaluate(() => window.fixtureDraftReady);
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
      '/api/admin/reports': { items:[],next:null },
      '/api/admin/drawings': { items:[],next:null },
    };
    if (url.pathname in data) return route.fulfill({ json: data[url.pathname] });
    const file = publicFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: 'not found' });
    const body = renderPageShell(file) ?? await readFile(new URL('../../' + file, import.meta.url));
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

test('admin sign-in is separate from the guest site and remains disabled without configuration', async ({ page }) => {
  let configured = false;
  const { requests, errors } = await fixture(page, {
    '/api/admin/status': route => route.fulfill({ json:{ configured, authenticated:false } }),
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name:'administration', level:1 })).toBeVisible();
  await expect(page.getByText('admin sign-in is not available yet.')).toBeVisible();
  await expect(page.getByRole('button', { name:'sign in with github' })).toHaveCount(0);
  configured = true;
  await page.reload();
  await expect(page.getByRole('button', { name:'sign in with github' })).toBeVisible();
  await expect(page.locator('form')).toHaveAttribute('method', 'post');
  await expect(page.locator('form')).toHaveAttribute('action', '/api/admin/login');
  expectNoEditor(requests);
  expect(requests).not.toContain('/api/today');
  expect(requests).not.toContain('/api/profile');
  expect(requests).not.toContain('/api/admin/activity');
  expect(errors).toEqual([]);
});

test('admin form sends an acceptable origin with the real page response headers', async ({ page }) => {
  let receivedOrigin, loginStatus, githubRedirect;
  // Inject the browser fixture origin; real config only permits HTTP on localhost.
  const config = { origin:'http://sketchlet.test', host:'sketchlet.test', secure:false, githubId:'123',
    clientId:'test', clientSecret:'test', callback:'http://sketchlet.test/api/admin/callback' };
  const handler = createAdminHandler({ getConfig:() => config, env:{},
    getStore:async () => ({ limit:async () => true, saveState:async () => {} }) });
  await fixture(page, {
    '/admin': async route => {
      let status, headers, body;
      await handlePublicPage({ method:'GET' }, {
        writeHead(code, values) { status=code; headers=values; }, end(value) { body=value; },
      }, new URL(route.request().url()), { origin:'http://sketchlet.test' });
      await route.fulfill({ status, headers, body });
    },
    '/api/admin/status': route => route.fulfill({ json:{ configured:true, authenticated:false } }),
    '/api/admin/login': async route => {
      const headers = await route.request().allHeaders(), responseHeaders = {};
      receivedOrigin = headers.origin;
      await handler({ method:route.request().method(), url:route.request().url(),
        headers:{ ...headers, host:'sketchlet.test' }, socket:{ remoteAddress:'127.0.0.1' } }, {
        setHeader(name,value) { responseHeaders[name]=value; },
        getHeader(name) { return responseHeaders[name]; },
        writeHead(status, values) { loginStatus=status; Object.assign(responseHeaders,values); }, end() {},
      }, '/api/admin/login');
      githubRedirect = responseHeaders.Location;
      // Stop here: never navigate to GitHub or use a real database in this test.
      await route.fulfill({ contentType:'text/html', body:'<h1>sign-in request received</h1>' });
    },
  });
  await page.goto('/admin');
  await page.getByRole('button', { name:'sign in with github' }).click();
  await expect(page.getByRole('heading', { name:'sign-in request received' })).toBeVisible();
  expect(receivedOrigin).toBe('http://sketchlet.test');
  expect(loginStatus).toBe(303);
  expect(new URL(githubRedirect).origin).toBe('https://github.com');
});

test('admin activity renders as text and sign-out clears the private view', async ({ page }) => {
  let loggedIn = true, logoutRequest;
  const { errors } = await fixture(page, {
    '/api/admin/status': route => route.fulfill({ json:{ configured:true, authenticated:loggedIn, login:'artist', csrf:'test-csrf' } }),
    '/api/admin/activity': route => route.fulfill({ json:{ actions:[{ actor_login:'<img src=x onerror=alert(1)>', action:'sign_in', created_at:'2026-10-08T12:00:00Z' }] } }),
    '/api/admin/logout': route => {
      logoutRequest = { method:route.request().method(), csrf:route.request().headers()['x-csrf-token'] };
      loggedIn = false; return route.fulfill({ json:{ signedOut:true } });
    },
  });
  await page.goto('/admin');
  await expect(page.locator('#admin-activity li')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#admin-activity img')).toHaveCount(0);
  await page.getByRole('button', { name:'sign out', exact:true }).click();
  await expect(page.getByRole('button', { name:'sign in with github' })).toBeVisible();
  await expect(page.locator('#admin-activity')).toHaveCount(0);
  expect(logoutRequest).toEqual({ method:'POST', csrf:'test-csrf' });
  await page.reload();
  await expect(page.locator('#admin-activity')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('fresh day shows instructions and preloads without mounting the editor until begin', async ({ page }) => {
  const { errors } = await fixture(page, {}, { emptyDraft: true });
  await page.goto('/');
  await expect(page.locator('#begin-drawing')).toBeVisible();
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(page.locator('.drawing-welcome')).toContainText(today.prompt);
  await expect(page.locator('canvas,.studio,.submit-bar')).toHaveCount(0);
  await page.locator('#begin-drawing').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#review-drawing')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('removed submission shows its reason without an editor, image, or sharing actions', async ({ page }) => {
  const removed = { id,date:drawing.date,prompt:drawing.prompt,mine:true,removed:true,reason:'removed as spam.',url:'/' };
  const { requests,errors } = await fixture(page, {
    '/api/today':route => route.fulfill({ json:{ ...today,submission:removed } }),
    '/api/profile/drawings':route => route.fulfill({ json:{ drawings:[removed],next:null } }),
  });
  await page.goto('/');
  await expect(page.locator('#page-content')).toContainText('removed as spam.');
  await expect(page.locator('#page-content')).toContainText('a replacement cannot be submitted');
  await expect(page.locator('#begin-drawing,#copy-drawing-link,.finished-drawing,canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'profile',exact:true}).click();
  await expect(page.locator('.profile-drawing-list')).toContainText('removed as spam.');
  await expect(page.locator('.profile-drawing-list img')).toHaveCount(0);
  expectNoEditor(requests);expect(errors).toEqual([]);
});

test('visitors can report a drawing without adding a profile name', async ({ page }) => {
  let submitted;
  const { errors,requests } = await fixture(page, {
    ['/api/drawings/' + id]:route => route.fulfill({ json:{ ...drawing,mine:false } }),
    [`/api/drawings/${id}/report`]:route => { submitted=route.request().postDataJSON();return route.fulfill({json:{reported:true}}); },
  });
  await page.goto(drawing.url);
  await page.getByRole('button',{name:'report drawing',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'report drawing'});
  await expect(dialog.getByRole('combobox',{name:'reason',exact:true})).toBeVisible();
  await dialog.getByLabel('reason',{exact:true}).selectOption('spam');
  await dialog.getByLabel('explanation (optional)').fill('please review this');
  await dialog.getByRole('button',{name:'send report'}).click();
  await expect(dialog.getByRole('status')).toContainText('ready for review');
  expect(submitted).toEqual({category:'spam',explanation:'please review this'});
  await dialog.getByRole('button',{name:'close',exact:true}).click();
  await expect(page.getByRole('button',{name:'report drawing',exact:true})).toBeFocused();
  expect(requests).not.toContain('/api/profile');expect(errors).toEqual([]);
});

test('admin review hides, restores, and resolves independently with private notes and CSRF', async ({ page }) => {
  const writes=[];let visibility='public',resolved=false;
  const {errors}=await fixture(page, {
    '/api/admin/status':route => route.fulfill({json:{configured:true,authenticated:true,login:'artist',csrf:'review-csrf'}}),
    '/api/admin/activity':route => route.fulfill({json:{actions:[]}}),
    '/api/admin/reports':route => route.fulfill({json:{items:resolved?[]:[{id:'1',drawing_id:id,prompt:drawing.prompt,date:drawing.date,
      display_name:'<img src=x>',category:'spam',explanation:'<script>bad</script>',status:'open',drawing_status:visibility}],next:null}}),
    [`/api/admin/drawings/${id}/moderate`]:route => {
      const body=route.request().postDataJSON();writes.push({body,csrf:route.request().headers()['x-csrf-token']});
      visibility=body.action==='hide'?'hidden':'public';return route.fulfill({json:{saved:true}});
    },
    '/api/admin/reports/1/resolve':route => { resolved=true;return route.fulfill({json:{saved:true}}); },
  });
  await page.goto('/admin');
  await expect(page.locator('.admin-review-card')).toContainText('<script>bad</script>');
  await expect(page.locator('.admin-review-card script')).toHaveCount(0);
  await page.getByRole('button',{name:'review drawing',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'review drawing'});
  await expect(dialog.getByRole('combobox',{name:'action',exact:true})).toBeVisible();
  await dialog.getByLabel('removal reason (visible to creator)',{exact:true}).selectOption('spam');
  await dialog.getByLabel('private note (optional)').fill('reviewed privately');
  await dialog.getByRole('button',{name:'apply action'}).click();
  await expect(dialog.getByRole('status')).toContainText('reports remain open');
  await expect(page.locator('.admin-review-card')).toContainText('hidden');
  expect(resolved).toBe(false);
  expect(writes[0]).toEqual({body:{action:'hide',reason:'spam',note:'reviewed privately'},csrf:'review-csrf'});
  await dialog.getByLabel('action',{exact:true}).selectOption('restore');
  await dialog.getByRole('button',{name:'apply action'}).click();
  await expect(page.locator('.admin-review-card')).toContainText('public');
  await dialog.getByLabel('action',{exact:true}).selectOption('resolve');
  await dialog.getByRole('button',{name:'apply action'}).click();
  await expect(dialog.getByRole('status')).toHaveText('report resolved.');
  await expect(page.locator('.admin-review-card')).toHaveCount(0);
  await dialog.getByRole('button',{name:'close',exact:true}).click();
  expect(errors).toEqual([]);
});

test('begin rechecks a submission created while reading instructions', async ({ page }) => {
  let calls = 0;
  await fixture(page, { '/api/today': route => route.fulfill({ json: {
    ...today, submission: ++calls === 1 ? null : drawing,
  } }) }, { emptyDraft: true });
  await page.goto('/');
  await page.locator('#begin-drawing').click();
  await expect(page.locator('.finished-drawing')).toBeVisible();
  await expect(page.locator('canvas,.studio')).toHaveCount(0);
});

test('startup loader conceals the shell until the editor is ready and respects reduced motion', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page, { '/api/today': async route => { await pending; await route.fulfill({ json: today }); } });
  await page.goto('/');
  await expect(page.locator('#page-loader')).toBeVisible();
  await expect(page.locator('.site-header')).toBeHidden();
  expect(await page.locator('.loading-sketch path').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  release();
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#review-drawing')).toBeEnabled();
  await expect(page.locator('.site-header')).toBeVisible();
});

test('completed home waits for its image before revealing the page', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await fixture(page, {
    '/api/today': route => route.fulfill({ json: { ...today, submission: drawing } }),
    [drawing.image]: async route => { await pending; await route.fulfill({ contentType: 'image/png', body: pixel }); },
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.finished-drawing')).toHaveCount(1);
  await expect(page.locator('#page-loader')).toBeVisible();
  await expect(page.locator('.site-header')).toBeHidden();
  release();
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(page.locator('.finished-drawing')).toBeVisible();
});

test('startup failure dismisses the loader and offers retry', async ({ page }) => {
  await fixture(page, { '/api/today': route => route.fulfill({ status: 503, json: { error: 'offline' } }) });
  await page.goto('/');
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(page.locator('#page-content')).toContainText('offline');
  await expect(page.locator('#page-content').getByRole('button', { name: 'try again' })).toBeVisible();
});

test('missing page module stops the loader animation and exposes retry', async ({ page }) => {
  await page.clock.install();
  await fixture(page, { '/src/home-page.js': route => route.abort() });
  await page.goto('/');
  await expect(page.locator('#page-loader')).toBeVisible();
  await page.clock.fastForward(15001);
  await expect(page.locator('#loading-retry')).toBeVisible();
  await expect(page.locator('#loading-message')).toContainText('taking longer');
  expect(await page.locator('.loading-sketch path').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('incremental pencil matches replay pixels over texture, after recovery and erasing', async ({ page }) => {
  await fixture(page);
  await page.goto('/gallery');
  const results = await page.evaluate(async () => {
    const { createBrushRenderer } = await import('/src/brushes.js');
    const { createActivePencilCache } = await import('/src/canvas-cache.js');
    const make = () => { const c = document.createElement('canvas'); c.width = c.height = 160; return c; };
    const draw = createBrushRenderer(make), failures = [];
    let replayGrains = 0, incrementalGrains = 0;
    for (const pencilVersion of [undefined, 2]) for (const shape of ['circle', 'square', 'rough']) for (const size of [5,14,32]) {
      const base = make(), live = make(), reference = make();
      const b = base.getContext('2d'), l = live.getContext('2d'), r = reference.getContext('2d');
      const texture = { tool: 'brush', shape, size: 32, style: 'pencil', seed: 19, color: '#663399', points: [[20,20],[140,140],[20,140],[140,20]] };
      draw(b, texture);
      const strokes = [texture];
      const cache = createActivePencilCache(l, 160, draw);
      const stroke = { ...texture, size, pencilVersion, seed: 27, color: '#112233', points: [] };
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

test('shared footer follows page content, aligns with the header, and stays out of full-screen drawing', async ({ page }) => {
  await fixture(page);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height:900 });
    for (const path of ['/', '/gallery', '/gallery?date=' + drawing.date, drawingPath(id, drawing.prompt)]) {
      await page.goto(path);
      await expect(page.locator('#page-loader')).toBeHidden();
      const footer = page.locator('body > footer');
      await expect(page.locator('footer')).toHaveCount(1);
      await expect(footer).toBeVisible();
      await expect(footer).toContainText('one drawing per day · final once saved');
      const header = await page.locator('.site-header').boundingBox();
      const bounds = await footer.boundingBox();
      const main = await page.locator('main').boundingBox();
      expect(bounds.x).toBeCloseTo(header.x, 1);
      expect(bounds.width).toBeCloseTo(header.width, 1);
      expect(bounds.y).toBeGreaterThanOrEqual(main.y + main.height);
    }
  }
  await page.setViewportSize({ width:320, height:650 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  await page.locator('.focus-launch').click();
  await expect(page.locator('footer')).toBeHidden();
  await page.locator('.drawing-focus .close-button').click();
  await expect(page.locator('footer')).toBeVisible();
});

test('page headings, skip navigation, and profile dialogs support keyboard access', async ({ page }) => {
  const { requests } = await fixture(page, {}, { emptyDraft:true });
  for (const path of ['/', '/gallery', drawingPath(id, drawing.prompt)]) {
    await page.goto(path);
    await expect(page.locator('#page-loader')).toBeHidden();
    const heading = page.getByRole('heading', { level:1 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeFocused();
    const skip = page.getByRole('link', { name:'skip to content' });
    await skip.focus();
    await expect(skip).toBeInViewport();
    const apiCount = requests.filter(path => path.startsWith('/api/')).length;
    // Wait for fragment traversal to dispatch before checking that no view reloads.
    await page.evaluate(() => {
      window.skipTraversal = new Promise(resolve => window.addEventListener('popstate', () => setTimeout(resolve, 0), { once:true }));
    });
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.skipTraversal);
    await expect(page.getByRole('main')).toBeFocused();
    expect(requests.filter(path => path.startsWith('/api/')).length).toBe(apiCount);
    const profile = page.getByRole('button', { name:'profile', exact:true });
    await profile.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name:'profile', exact:true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(profile).toBeFocused();
  }
});

test('submission review has a name and returns keyboard focus after cancellation', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  const save = page.locator('#review-drawing');
  await expect(save).toBeEnabled();
  await save.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name:'save “laughing kite”?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(save).toBeFocused();
});

test('ratings can be selected and submitted using the keyboard without drawing', async ({ page }) => {
  let vote;
  const other = { ...drawing, mine:false };
  await fixture(page, {
    '/api/queue': route => route.fulfill({ json:[other] }),
    ['/api/drawings/' + id + '/vote']: async route => {
      vote = route.request().postDataJSON();
      await route.fulfill({ json:{ ...other, myVote:vote.stars, count:1, average:vote.stars } });
    },
  });
  await page.goto('/gallery?view=rate');
  const first = page.getByRole('radio', { name:'1 star', exact:true });
  await expect(first).toBeEnabled();
  await first.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name:'2 stars', exact:true })).toBeChecked();
  await page.getByRole('button', { name:'save rating', exact:true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name:'rating break', level:1 })).toBeVisible();
  expect(vote).toEqual({ stars:2 });
  await expect(page.locator('canvas')).toHaveCount(0);
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

test('line preview and connected fill survive undo, redo and draft reload', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  await page.locator('.focus-launch').click();
  const canvas = page.locator('#canvas');
  await page.locator('[data-focus="style"]').selectOption('line');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x - 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.move(box.x + box.width + 5, box.y + box.height / 2);
  await page.mouse.up();
  const line = await canvas.evaluate(c => c.toDataURL());
  expect(await canvas.evaluate(c => Array.from(c.getContext('2d').getImageData(0,600,1,1).data))).toEqual([52,48,68,255]);
  await page.locator('[data-focus="style"]').selectOption('fill');
  await page.mouse.click(box.x - 5, box.y + box.height / 4);
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(line);
  await expect(page.locator('[data-focus="shape"]')).toBeDisabled();
  await expect(page.locator('[data-focus="size"]')).toBeDisabled();
  await page.locator('[data-color-menu="color"]').click();
  await page.locator('.color-menu-option[data-color="#CE4949"]').click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 4);
  const filled = await canvas.evaluate(c => c.toDataURL());
  expect(filled).not.toBe(line);
  expect(await canvas.evaluate(c => {
    const ctx = c.getContext('2d');
    return [Array.from(ctx.getImageData(600,300,1,1).data), Array.from(ctx.getImageData(600,900,1,1).data)];
  })).toEqual([[206,73,73,255],[255,255,255,255]]);
  await page.locator('#undo').click();
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(line);
  await page.locator('#redo').click();
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(filled);
  await expect(page.locator('#save-status')).toHaveText('draft saved');
  await page.reload();
  await expect(page.locator('#review-drawing')).toBeEnabled();
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(filled);
  await page.locator('.focus-launch').click();
  await page.locator('[data-color-menu="background"]').click();
  await page.locator('.color-menu-option[data-color="#FFF3D2"]').click();
  expect(await canvas.evaluate(c => {
    const ctx = c.getContext('2d');
    return [Array.from(ctx.getImageData(600,300,1,1).data), Array.from(ctx.getImageData(600,900,1,1).data)];
  })).toEqual([[206,73,73,255],[255,243,210,255]]);
  await page.locator('#undo').click();
  expect(await canvas.evaluate(c => c.toDataURL())).toBe(filled);
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
        const event = new PointerEvent('pointermove', { ...samples.at(-1), pointerId: element.testPointerId, pointerType: 'mouse', isPrimary: true, bubbles: true });
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

test('320 by 650 touch workspace fits controls and draws upward from the extra strip', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'requires touch input');
  await fixture(page);
  await page.setViewportSize({ width:320, height:650 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  const normalTools = await page.locator('.mobile-sketch-tools').boundingBox();
  expect(normalTools.y + normalTools.height).toBeLessThanOrEqual(650);
  await page.locator('.focus-launch').click();
  const tools = await page.locator('.drawing-focus .focus-tools').boundingBox();
  expect(tools.y + tools.height).toBeLessThanOrEqual(650);
  const canvas = page.locator('#canvas'), bounds = await canvas.boundingBox();
  const strip = await page.locator('.touch-drawing-strip').boundingBox();
  expect(strip.height).toBe(24);
  const contactX = bounds.x + bounds.width / 2, contactY = strip.y + 12;
  await page.touchscreen.tap(contactX, contactY);
  const targetY = Math.round((contactY - 24 - bounds.y) / bounds.height * 1200);
  const pixel = await canvas.evaluate((c,y) => Array.from(c.getContext('2d').getImageData(600,y,1,1).data), targetY);
  expect(pixel).toEqual([52,48,68,255]);
  await expect(page.locator('#undo')).toBeEnabled();
  expect(await page.locator('.drawing-focus').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
});

test('drawing dropdowns preserve their surfaces and accessible color menus across layouts', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width:1280, height:900 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  const expectDropdown = async (control, height) => {
    await expect(control).toBeVisible();
    await expect(control).toHaveCSS('height', `${height}px`);
    await expect(control).toHaveCSS('background-color', 'rgb(248, 244, 252)');
    await expect(control).toHaveCSS('border-top-style', 'inset');
    await expect(control).toHaveCSS('border-top-width', '3px');
    await expect(control).toHaveCSS('border-radius', '0px');
    await expect(control).toHaveCSS('font-size', '16px');
  };
  await expectDropdown(page.locator('#brush-style'), 46);
  await expectDropdown(page.locator('#brush-shape'), 46);
  for (const paletteId of ['palette', 'background-palette']) {
    const picker = page.locator('.color-picker').filter({ has:page.locator(`#${paletteId}`) });
    const summary = picker.locator('summary');
    await summary.click();
    const palette = picker.locator('.palette');
    await expect(palette).toBeVisible();
    await expect(palette).toHaveCSS('width', '280px');
    await expect(palette).toHaveCSS('background-color', 'rgb(213, 208, 217)');
    await expect(palette.locator('.swatch').first()).toHaveCSS('height', '44px');
    await expect(palette.locator('.swatch.selected')).toHaveCSS('outline-style', 'dotted');
    await summary.press('Escape');
    await expect(palette).toBeHidden();
    await expect(summary).toBeFocused();
  }
  await page.setViewportSize({ width:320, height:650 });
  for (const fullscreen of [false, true]) {
    if (fullscreen) await page.locator('.focus-launch').click();
    const container = page.locator(fullscreen ? '.drawing-focus' : '.mobile-sketch-tools');
    for (const name of ['tool', 'size', 'shape', 'style']) {
      await expectDropdown(container.locator(`[data-focus="${name}"]`), 44);
    }
    for (const name of ['color', 'background']) {
      const button = container.locator(`[data-color-menu="${name}"]`);
      await expectDropdown(button, 44);
      await button.click();
      const menu = page.locator('.color-menu');
      await expect(menu).toBeVisible();
      const bounds = await menu.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(650);
      await menu.locator('[aria-pressed="true"]').click();
      await expect(menu).toBeHidden();
      await expect(button).toBeFocused();
    }
  }
});

test('cursor shapes retain hollow centers and contrasting drawing and erase outlines', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width:1280, height:900 });
  await page.goto('/');
  await expect(page.locator('#review-drawing')).toBeEnabled();
  for (const tool of ['brush', 'eraser']) for (const shape of ['circle', 'square', 'rough']) {
    await page.locator('#' + tool).click();
    await page.locator('#brush-shape').selectOption(shape);
    await page.locator('#canvas').hover();
    const cursor = page.locator('.eraser-cursor');
    await expect(cursor).toBeVisible();
    const styles = await cursor.evaluate(el => {
      const style = getComputedStyle(el), polygon = el.querySelector('polygon:last-child');
      return { background:style.backgroundColor, border:style.borderTopColor, radius:style.borderRadius,
        svgDisplay:getComputedStyle(el.querySelector('svg')).display,
        fill:getComputedStyle(polygon).fill, stroke:getComputedStyle(polygon).stroke,
        outline:getComputedStyle(el.querySelector('.cursor-outline')).stroke };
    });
    const color = tool === 'eraser' ? 'rgb(197, 46, 66)' : 'rgb(52, 48, 68)';
    expect(styles.background).toBe('rgba(0, 0, 0, 0)');
    if (shape === 'rough') {
      expect(styles.svgDisplay).toBe('block');
      expect(styles.fill).toBe('none'); expect(styles.stroke).toBe(color);
      expect(styles.outline).toBe('rgb(255, 255, 255)');
    } else {
      expect(styles.svgDisplay).toBe('none'); expect(styles.border).toBe(color);
      expect(styles.radius).toBe(shape === 'square' ? '0px' : '50%');
    }
    // The touch halo is independent of the footprint, but uses its tool color.
    const halo = await cursor.evaluate(el => {
      el.dataset.input = 'touch';
      const style = getComputedStyle(el, '::after');
      const result = { color:style.borderTopColor, width:style.width, fill:style.backgroundColor };
      el.dataset.input = 'mouse'; return result;
    });
    expect(halo).toEqual({ color, width:'20px', fill:'rgba(0, 0, 0, 0)' });
  }
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
  let fail = false;
  await fixture(page, { [drawing.image]: route => fail
    ? route.fulfill({ status: 503, body: 'unavailable' })
    : route.fulfill({ contentType: 'image/png', body: pixel }) });
  await page.goto(drawing.url);
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(page.getByRole('button', { name: 'share card', exact: true })).toBeVisible();
  // Fail the card generator's fetch, not the page's initial image decode.
  fail = true;
  await page.getByRole('button', { name: 'share card', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'share card' });
  await expect(dialog.getByRole('button', { name: 'try again' })).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'try again' }).click();
  await expect(dialog.locator('img')).toBeVisible();
  await dialog.getByRole('button', { name: 'close share card' }).click();
  await expect(page.locator('#start-rating')).toBeVisible();
});

test('failed initial drawing image reveals an error and reload can recover', async ({ page }) => {
  let fail = true;
  await fixture(page, { [drawing.image]: route => fail
    ? route.fulfill({ status: 503, body: 'unavailable' })
    : route.fulfill({ contentType: 'image/png', body: pixel }) });
  await page.goto(drawing.url);
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(page.locator('#page-content')).toContainText('could not load the drawing image');
  fail = false;
  await page.locator('#page-content').getByRole('button', { name: 'try again' }).click();
  await expect(page.locator('.finished-drawing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'share card', exact: true })).toBeVisible();
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
