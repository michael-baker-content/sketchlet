import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startHome } from '../src/page-startup.js';
import { PUBLIC_FILES } from '../backend/public-files.mjs';
import { PAGE_FILES, renderPageShell } from '../backend/page-shell.mjs';

test('completed home never loads the editor', async () => {
  const today = { submission: { id: 'saved-drawing' } };
  let shown;
  await startHome({ loadToday: async () => today,
    loadEditor: () => assert.fail('completed drawing must not initialize editor'),
    startPage: async options => { shown = options; } });
  assert.deepEqual(shown, { page: 'home', today, editor: null });
});

test('incomplete home waits for status before initializing the editor', async () => {
  let resolveStatus;
  const pending = new Promise(resolve => { resolveStatus = resolve; });
  const events = [], today = { submission: null }, editor = {};
  const starting = startHome({ loadToday: () => pending,
    checkDraft: async () => true,
    loadEditor: async () => { events.push('editor'); return editor; },
    startPage: async options => { events.push('page'); assert.equal(options.editor, editor); } });
  assert.deepEqual(events, []);
  resolveStatus(today);
  await starting;
  assert.deepEqual(events, ['editor', 'page']);
});

test('new day shows instructions without initializing the editor', async () => {
  const today = { date: '2026-10-07', submission: null };
  const loadEditor = () => assert.fail('instructions must not initialize the editor');
  let shown;
  await startHome({ loadToday: async () => today, checkDraft: async () => false, loadEditor,
    startPage: async options => { shown = options; } });
  assert.equal(shown.editor, null);
  assert.equal(shown.loadEditor, loadEditor);
  assert.equal(shown.storageUnavailable, false);
});

test('failed status lookup never assumes that drawing is allowed', async () => {
  await assert.rejects(startHome({
    loadToday: async () => { throw new Error('offline'); },
    loadEditor: () => assert.fail('must not load editor on status failure'),
    startPage: () => assert.fail('must not show an unverified home state'),
  }), /offline/);
});

test('page shells contain no editor and all static or dynamic module imports are published', async () => {
  for (const file of PAGE_FILES) {
    const html = renderPageShell(file);
    assert.doesNotMatch(html, /<canvas|class="studio"|src="\/src\/studio.js"/);
    assert.match(html, /id="page-content"/);
  }
  for (const file of PUBLIC_FILES.filter(file => file.endsWith('.js'))) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const path = new URL(match[1], 'https://sketchlet.test/' + file).pathname.slice(1);
      assert.ok(PUBLIC_FILES.includes(path), `${file} imports unpublished ${path}`);
    }
  }
});

test('gallery entry has no static dependency on the editor', async () => {
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/^import .* from ['"](\.[^'"]+)['"]/gm)) {
      await visit(new URL(match[1], 'https://sketchlet.test/' + file).pathname.slice(1));
    }
  }
  await visit('src/gallery-page.js');
  for (const file of ['src/studio.js', 'src/brushes.js', 'src/submission.js', 'src/model.js']) {
    assert.equal(visited.has(file), false, `gallery eagerly loads ${file}`);
  }
});
