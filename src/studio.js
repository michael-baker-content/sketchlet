import { COLORS, BRUSH_SIZES, CANVAS_SIZE, createDocument, draftKey, restoreDraft, History } from './model.js';
import { BRUSH_SHAPES, DRAWING_TOOLS, createBrushRenderer, roughVertices } from './brushes.js';
import { fillRuns, drawFill } from './fill.js';
import { openDraftDatabase, readDraft } from './draft-storage.js';
import { createStrokeCache, createActivePencilCache, watchCanvasRecovery } from './canvas-cache.js';
import { setCloseIcon } from './close-button.js';
import { canvasPoint, appendPointerSamples } from './pointer-input.js';

const $ = s => document.querySelector(s);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const ink = document.createElement('canvas');
ink.width = ink.height = CANVAS_SIZE;
const inkCtx = ink.getContext('2d');
const committedInk = document.createElement('canvas');
committedInk.width = committedInk.height = CANVAS_SIZE;
const committedCtx = committedInk.getContext('2d');
const strokeCache = createStrokeCache(committedCtx, CANVAS_SIZE, drawStroke);
let history = new History();
let tool = 'brush', color = COLORS[0].value, size = 14, brushStyle = 'brush', brushShape = 'circle';
// Views subscribe after their controls are constructed. State changes call this
// directly; markup and synthetic input events are never the source of truth.
let syncToolViews = () => {};
const paletteViews = [];
let drawShapedStroke = createBrushRenderer(() => document.createElement('canvas'));
const activePencilCache = createActivePencilCache(inkCtx, CANVAS_SIZE,
  (context, stroke, samples) => drawShapedStroke(context, stroke, samples));
const canvasAvailable = watchCanvasRecovery([ctx, inkCtx, committedCtx], () => {
  strokeCache.invalidate();
  activePencilCache.invalidate();
  // Legacy pencil patterns may also have lost their backing storage.
  drawShapedStroke = createBrushRenderer(() => document.createElement('canvas'));
}, () => render());
let active = null, pointerId = null, ready = false, db = null, saveTimer, toastTimer;
let promptDay = null, saveQueue = Promise.resolve(), dayQueue = Promise.resolve();
// Drawing gestures should never open an image menu or start a native drag.
for (const type of ['contextmenu', 'dragstart', 'selectstart']) {
  canvas.addEventListener(type, event => event.preventDefault());
}
const eraserCursor = document.createElement('div');
eraserCursor.className = 'eraser-cursor';
eraserCursor.setAttribute('aria-hidden', 'true');
const roughOutline = roughVertices.map(([x, y]) => `${50 + x * 48},${50 + y * 48}`).join(' ');
eraserCursor.innerHTML = `<svg viewBox="0 0 100 100"><polygon points="${roughOutline}" class="cursor-outline"/><polygon points="${roughOutline}"/></svg>`;
$('#canvas-frame').append(eraserCursor);
let cursorPoint = null;
function updateEraserCursor(event) {
  if (event) cursorPoint = { x: event.clientX, y: event.clientY, type: event.pointerType };
  // Ordinary drawing has no eraser overlay to measure or position.
  if (tool !== 'eraser' || !cursorPoint) {
    eraserCursor.classList.remove('visible');
    canvas.style.cursor = tool === 'eraser' ? 'none' : 'crosshair';
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const visible = tool === 'eraser' && cursorPoint &&
    cursorPoint.x >= rect.left && cursorPoint.x <= rect.right &&
    cursorPoint.y >= rect.top && cursorPoint.y <= rect.bottom &&
    (cursorPoint.type !== 'touch' || active);
  eraserCursor.classList.toggle('visible', !!visible);
  eraserCursor.dataset.shape = brushShape;
  canvas.style.cursor = tool === 'eraser' ? 'none' : 'crosshair';
  if (!visible) return;
  eraserCursor.style.width = `${size / CANVAS_SIZE * rect.width}px`;
  eraserCursor.style.height = `${size / CANVAS_SIZE * rect.height}px`;
  eraserCursor.style.left = `${canvas.offsetLeft + cursorPoint.x - rect.left}px`;
  eraserCursor.style.top = `${canvas.offsetTop + cursorPoint.y - rect.top}px`;
}
canvas.addEventListener('pointerenter', updateEraserCursor);
canvas.addEventListener('pointermove', updateEraserCursor);
canvas.addEventListener('pointerdown', event => requestAnimationFrame(() => updateEraserCursor(event)));
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(eventName, event => {
  if (event.pointerType === 'touch' || eventName === 'pointercancel') { cursorPoint = null; eraserCursor.classList.remove('visible'); }
});
canvas.addEventListener('pointerleave', () => { cursorPoint = null; eraserCursor.classList.remove('visible'); });
window.addEventListener('blur', () => { cursorPoint = null; eraserCursor.classList.remove('visible'); });
new ResizeObserver(() => updateEraserCursor()).observe(canvas);
document.addEventListener('scroll', () => { cursorPoint = null; eraserCursor.classList.remove('visible'); }, true);

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2600); }
function drawStroke(context, stroke) {
  if (stroke.tool === 'fill') { drawFill(context, stroke); return; }
  if (stroke.shape !== undefined) { drawShapedStroke(context, stroke); return; }
  // Retain the original renderer for saved strokes without an explicit shape.
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.lineCap = context.lineJoin = 'round'; context.lineWidth = stroke.size; context.strokeStyle = context.fillStyle = stroke.color;
  const points = stroke.points;
  if (stroke.tool === 'brush' && stroke.style === 'rough') {
    // Deterministic irregular stamps keep saved drafts and undo visually identical.
    let stampIndex = 0;
    const stamp = (x, y) => {
      const seed = stampIndex++;
      context.beginPath();
      for (let vertex = 0; vertex < 9; vertex++) {
        const noise = Math.sin(seed * 12.9898 + vertex * 78.233) * 43758.5453;
        const radius = stroke.size * (.29 + (noise - Math.floor(noise)) * .3);
        const angle = vertex / 9 * Math.PI * 2 + seed * .7;
        const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
        if (vertex === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.fill();
    };
    stamp(...points[0]);
    const spacing = Math.max(1, stroke.size * .18);
    let distanceToNext = spacing;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let distance = distanceToNext;
      for (; distance <= length; distance += spacing) {
        const fraction = distance / length;
        stamp(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction);
      }
      distanceToNext = distance - length;
    }
    context.restore(); return;
  }
  if (stroke.tool === 'brush' && stroke.style === 'dashed') context.setLineDash([stroke.size * 2.5, stroke.size * 2]);
  if (points.length === 1) { context.beginPath(); context.arc(points[0][0], points[0][1], stroke.size / 2, 0, Math.PI * 2); context.fill(); }
  else { context.beginPath(); context.moveTo(...points[0]); for (let i = 1; i < points.length - 1; i++) { const next = points[i + 1]; context.quadraticCurveTo(...points[i], (points[i][0] + next[0]) / 2, (points[i][1] + next[1]) / 2); } context.lineTo(...points.at(-1)); context.stroke(); }
  context.restore();
}
function render() {
  if (!canvasAvailable()) return false;
  strokeCache.sync(history.document.strokes);
  if (!activePencilCache.sync(active, history.document.strokes, committedInk)) {
    inkCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    inkCtx.drawImage(committedInk, 0, 0);
    if (active) drawStroke(inkCtx, active);
  }
  ctx.fillStyle = history.document.background; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); ctx.drawImage(ink, 0, 0);
  $('#canvas-hint').classList.toggle('hidden', history.document.strokes.length > 0 || !!active);
  return canvasAvailable();
}
function syncControls() {
  $('#undo').disabled = !history.past.length; $('#redo').disabled = !history.future.length;
  $('#clear').disabled = !history.document.strokes.length;
  for (const button of document.querySelectorAll('[data-background]')) { const selected = button.dataset.background === history.document.background; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); }
  syncToolViews();
}
function hideDraftStatus() { $('#save-status').hidden = true; }
function changed() { hideDraftStatus(); render(); syncControls(); scheduleSave(); }
function selectTool(next) {
  if (!['brush', 'eraser'].includes(next)) return;
  tool = next;
  syncToolViews(); updateEraserCursor();
}
function selectColor(value, background = false) {
  if (!ready || !COLORS.some(entry => entry.value === value)) return;
  if (background) {
    if (active || history.document.background === value) return;
    history.commit({ ...history.document, background: value }); changed();
  } else {
    color = value; selectTool('brush');
  }
}
for (const entry of COLORS) {
  for (const background of [false, true]) {
    const button = document.createElement('button'); button.className = 'swatch'; button.style.setProperty('--color', entry.value); button.style.setProperty('--check', entry.name === 'Midnight' ? '#FFFFFF' : '#343044');
    const rgb = entry.value.slice(1).match(/../g).map(channel => parseInt(channel, 16));
    button.style.setProperty('--check', rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 < 140 ? '#FFFFFF' : '#343044');
    button.title = entry.name.toLowerCase(); button.setAttribute('aria-label', `${entry.name.toLowerCase()} ${background ? 'background' : 'ink'}`); button.setAttribute('aria-pressed', false);
    if (background) button.dataset.background = entry.value; else button.dataset.ink = entry.value;
    button.addEventListener('click', () => selectColor(entry.value, background));
    $(background ? '#background-palette' : '#palette').append(button);
  }
}
// Keep the swatch palettes inside native disclosure controls for keyboard and touch use.
for (const background of [false, true]) {
  const palette = $(background ? '#background-palette' : '#palette');
  const picker = document.createElement('details');
  picker.className = 'color-picker';
  const summary = document.createElement('summary');
  summary.innerHTML = '<span class="selected-color-chip" aria-hidden="true"></span><span class="selected-color-name"></span><span class="picker-arrow" aria-hidden="true">▾</span>';
  picker.append(summary);
  palette.before(picker);
  picker.append(palette);
  const update = () => {
    const value = background ? history.document.background : color;
    const selected = COLORS.find(entry => entry.value === value);
    summary.querySelector('.selected-color-chip').style.background = value;
    summary.querySelector('.selected-color-name').textContent = selected.name.toLowerCase();
    summary.setAttribute('aria-label', `${background ? 'background' : 'color'}: ${selected.name.toLowerCase()}`);
  };
  palette.addEventListener('click', event => { if (!event.target.closest('button')) return; update(); picker.open = false; summary.focus(); });
  picker.addEventListener('toggle', () => { if (picker.open) for (const other of document.querySelectorAll('.color-picker')) if (other !== picker) other.open = false; });
  picker.addEventListener('keydown', event => { if (event.key === 'Escape') { picker.open = false; summary.focus(); } });
  paletteViews.push(update);
  update();
}
document.addEventListener('click', event => { for (const picker of document.querySelectorAll('.color-picker')) if (!picker.contains(event.target)) picker.open = false; });
$('#brush').onclick = () => selectTool('brush'); $('#eraser').onclick = () => selectTool('eraser');
document.querySelectorAll('.section-label h2').forEach((heading, index) => { heading.textContent = ['Tools', 'Color', 'Brush size', 'Background'][index]; });
$('.studio-title').textContent = "today's prompt";
$('#save-status').textContent = 'ready';
const editLabel = document.createElement('span');
editLabel.className = 'history-label';
editLabel.id = 'history-label';
editLabel.textContent = 'edit';
$('.history-actions').prepend(editLabel);
$('.history-actions').setAttribute('role', 'group');
$('.history-actions').setAttribute('aria-labelledby', 'history-label');
for (const id of ['undo', 'redo']) {
  const button = $('#' + id);
  const label = document.createElement('span');
  label.className = 'history-button-text';
  for (const node of [...button.childNodes]) if (node.nodeType === Node.TEXT_NODE) label.append(node);
  button.append(label);
}
const styleSection = document.createElement('div');
styleSection.className = 'tool-section brush-style-section';
styleSection.innerHTML = '<label class="brush-select-label">drawing tools<select id="brush-style"></select></label>';
const shapeSection = document.createElement('div');
shapeSection.className = 'tool-section brush-shape-section';
shapeSection.innerHTML = '<label class="brush-select-label">brush shape<select id="brush-shape"></select></label>';
document.querySelector('.sizes').closest('.tool-section').after(styleSection);
styleSection.before(shapeSection);
for (const [select, options] of [[$('#brush-shape'), BRUSH_SHAPES], [$('#brush-style'), DRAWING_TOOLS]]) {
  for (const value of options) select.add(new Option(value, value));
}
function selectShape(value) { if (!BRUSH_SHAPES.includes(value)) return; brushShape = value; syncToolViews(); updateEraserCursor(); }
function selectStyle(value) { if (!DRAWING_TOOLS.includes(value)) return; brushStyle = value; syncToolViews(); }
$('#brush-shape').onchange = event => selectShape(event.target.value);
$('#brush-style').onchange = event => selectStyle(event.target.value);
function selectSize(next) {
  if (!BRUSH_SIZES.includes(next)) return;
  size = next;
  syncToolViews(); updateEraserCursor();
}
for (const b of document.querySelectorAll('[data-size]')) b.onclick = () => selectSize(Number(b.dataset.size));
$('#undo').onclick = () => { if (ready && !active && history.undo()) changed(); };
$('#redo').onclick = () => { if (ready && !active && history.redo()) changed(); };
$('#clear').onclick = () => { if (!ready || active || !history.document.strokes.length) return; history.commit({ ...history.document, strokes: [] }); changed(); toast('Fresh canvas. Undo brings your drawing back.'); };
canvas.addEventListener('pointerdown', event => {
  if (!ready || active || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  if (tool === 'brush' && brushStyle === 'fill') {
    event.preventDefault();
    if (!render()) { toast('canvas recovering. please try again.'); return; }
    const [x, y] = canvasPoint(event, canvas.getBoundingClientRect(), CANVAS_SIZE);
    try {
      const runs = fillRuns(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE), x, y, color);
      if (!canvasAvailable()) { toast('canvas recovering. please try again.'); return; }
      if (runs.length) {
        history.commit({ ...history.document, strokes: [...history.document.strokes, { tool: 'fill', color, runs }] });
        changed();
      }
    } catch { toast('could not fill this area. please try again.'); }
    return;
  }
  hideDraftStatus();
  event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
  active = { tool, color, size, style: tool === 'eraser' ? 'brush' : brushStyle, shape: brushShape, points: [canvasPoint(event, canvas.getBoundingClientRect(), CANVAS_SIZE)] };
  if (tool === 'brush' && brushStyle === 'pencil') active.seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (tool === 'brush' && brushStyle === 'spray') active.sprayVersion = 3;
  render();
});
let frame = null;
canvas.addEventListener('pointermove', event => {
  if (!active || event.pointerId !== pointerId) return;
  if (active.style === 'line') active.points[1] = canvasPoint(event, canvas.getBoundingClientRect(), CANVAS_SIZE);
  else appendPointerSamples(active.points, event, canvas.getBoundingClientRect(), CANVAS_SIZE);
  if (frame === null) frame = requestAnimationFrame(() => { frame = null; render(); });
});
function finish(event) {
  if (!active || event.pointerId !== pointerId) return;
  if (active.style === 'line' && event.type === 'pointerup') active.points[1] = canvasPoint(event, canvas.getBoundingClientRect(), CANVAS_SIZE);
  if (active.style === 'line' && ['pointercancel', 'lostpointercapture'].includes(event.type)) {
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
    active = null; pointerId = null; render(); return;
  }
  // changed() paints the committed stroke immediately; a queued preview would
  // otherwise repaint that same result on the next animation frame.
  if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
  history.commit({ ...history.document, strokes: [...history.document.strokes, active] });
  active = null; pointerId = null; changed();
}
canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
document.addEventListener('keydown', event => {
  if (!ready || active || event.altKey || canvas.closest('[hidden]')) return;
  // Text editing and secondary dialogs own their keyboard shortcuts.
  if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
  if (document.querySelector('dialog[open]:not(.drawing-focus)')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey ? history.redo() : history.undo()) changed(); }
});
$('#download').onclick = () => {
  if (!ready) return;
  if (!render()) { toast('canvas recovering. please try again.'); return; }
  canvas.toBlob(blob => { if (!blob || !canvasAvailable()) { toast('Could not save the image. Please try again.'); return; } const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sketchlet.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); toast('PNG downloaded.'); }, 'image/png');
};
function scheduleSave() { $('#save-status').textContent = 'saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => persist(), 200); }
async function persist() {
  if (!promptDay) return;
  if (!db) { $('#save-status').textContent = 'saving unavailable'; return; }
  // Capture the date and document together before any async work or day switch.
  const day = promptDay, record = { day, document: history.document };
  saveQueue = saveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(record, draftKey(day));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }));
  try { await saveQueue; if (day === promptDay) $('#save-status').textContent = 'draft saved'; }
  catch { $('#save-status').textContent = 'couldn’t save draft'; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && ready) { clearTimeout(saveTimer); persist(); } });
window.addEventListener('pagehide', () => { if (ready) { clearTimeout(saveTimer); persist(); } });
async function initialize() {
  try {
    db = await openDraftDatabase();
  } catch { $('#save-status').textContent = 'saving unavailable'; }
  render(); syncControls();
}
render(); syncControls();
const initialized = initialize();
export function setPromptDay(day) {
  draftKey(day);
  dayQueue = dayQueue.catch(() => {}).then(async () => {
    await initialized;
    if (promptDay === day) return;
    ready = false; $('.toolbox').inert = true; syncToolViews(); clearTimeout(saveTimer);
    if (active) { history.commit({ ...history.document, strokes: [...history.document.strokes, active] }); active = null; pointerId = null; }
    await persist();
    promptDay = day; history = new History(); strokeCache.invalidate(); cursorPoint = null;
    $('#save-status').hidden = false;
    render(); syncControls(); updateEraserCursor();
    try {
      const saved = db ? await readDraft(db, day) : null;
      history = new History(restoreDraft(saved, day));
      $('#save-status').textContent = !db ? 'saving unavailable' : saved?.day === day ? 'draft restored' : 'fresh canvas';
    } catch { $('#save-status').textContent = 'saving unavailable'; }
    ready = true; $('.toolbox').inert = false; render(); syncControls();
  });
  return dayQueue;
}
export function captureDraft(day) {
  if (!ready || promptDay !== day) throw new Error('the prompt changed. please review the current canvas.');
  if (active) throw new Error('finish your stroke before saving.');
  if (!render()) throw new Error('canvas recovering. please try saving again.');
  return { date: promptDay, image: canvas.toDataURL('image/png') };
}

// Move the existing canvas into a modal workspace; its pixels, listeners and
// history stay intact. Color menus use a bounded dialog to show real swatches.
const focusButton = document.createElement('button');
focusButton.className = 'web-button focus-launch';
focusButton.textContent = 'full screen';
focusButton.setAttribute('aria-haspopup', 'dialog');
$('.studio-top').append(focusButton);
const focusView = document.createElement('dialog');
focusView.className = 'drawing-focus';
focusView.setAttribute('aria-label', 'full screen drawing');
focusView.innerHTML = `<div class="focus-info"><div class="focus-info-top"><p class="focus-date"><span class="focus-brand">sketchlet * </span><span class="focus-date-value"></span></p></div><h2 class="focus-prompt"></h2></div>
  <div class="focus-actions"><div class="focus-history"></div><button class="web-button focus-close" aria-label="close full screen drawing"></button></div>
  <div class="focus-canvas"></div>
  <div class="focus-tools" aria-label="drawing tools">
    <label>tools<select data-focus="tool"><option value="brush">draw</option><option value="eraser">erase</option></select></label>
    <label>brush size<select data-focus="size"><option value="5">fine</option><option value="14">mid</option><option value="32">bold</option></select></label>
    <label>brush shape<select data-focus="shape"></select></label>
    <label>drawing tools<select data-focus="style"></select></label>
    <label>color<select data-focus="color"></select></label>
    <label>background<select data-focus="background"></select></label>
  </div>`;
document.body.append(focusView);
setCloseIcon(focusView.querySelector('.focus-close'));
const sharedInfo = focusView.querySelector('.focus-info');
const sharedTools = focusView.querySelector('.focus-tools');
const normalInfo = document.createElement('div');
normalInfo.className = 'mobile-sketch-info';
const normalActions = document.createElement('div');
normalActions.className = 'mobile-sketch-actions focus-actions';
const normalTools = document.createElement('div');
normalTools.className = 'mobile-sketch-tools';
$('.studio-body').prepend(normalInfo, normalActions);
$('.studio-body').append(normalTools);
const launchHome = document.createComment('full screen button home');
focusButton.before(launchHome);
// Keep this aligned with the stacked studio breakpoint in src/styles/flow.css.
const stackedLayout = window.matchMedia('(max-width:760px), (min-width:761px) and (max-width:1100px) and (orientation:portrait)');
const unsupportedFocusLayout = window.matchMedia('(orientation:landscape) and (max-width:1100px)');
function syncFocusInfo() {
  const date = $('.prompt-date')?.textContent.split(' · ')[0] ?? '';
  sharedInfo.querySelector('.focus-date-value').textContent = date;
  sharedInfo.querySelector('.focus-prompt').textContent = `today's prompt: ${$('.daily-heading h1')?.textContent ?? ''}`;
}
const focusInfoObserver = new MutationObserver(syncFocusInfo);
focusInfoObserver.observe($('.intro'), { subtree: true, childList: true, characterData: true });
const focusSelect = name => sharedTools.querySelector(`[data-focus="${name}"]`);
for (const [name, options] of [['shape', BRUSH_SHAPES], ['style', DRAWING_TOOLS]]) {
  for (const value of options) focusSelect(name).add(new Option(value, value));
}
for (const name of ['color', 'background']) for (const entry of COLORS) {
  const option = document.createElement('option');
  option.value = entry.value; option.textContent = entry.name.toLowerCase();
  focusSelect(name).append(option);
}
const colorMenu = document.createElement('dialog');
colorMenu.className = 'color-menu';
colorMenu.setAttribute('aria-labelledby', 'color-menu-title');
colorMenu.innerHTML = '<div class="color-menu-heading"><h2 id="color-menu-title"></h2><button type="button" class="web-button" aria-label="close colors">×</button></div><div class="color-menu-options"></div>';
document.body.append(colorMenu);
setCloseIcon(colorMenu.querySelector('.color-menu-heading button'));
let activeColorMenu = null;
colorMenu.querySelector('.color-menu-heading button').onclick = () => colorMenu.close();
colorMenu.addEventListener('click', event => { if (event.target === colorMenu) colorMenu.close(); });
for (const entry of COLORS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'color-menu-option';
  button.dataset.color = entry.value;
  const swatch = document.createElement('span');
  swatch.className = 'color-menu-swatch';
  swatch.style.backgroundColor = entry.value;
  swatch.setAttribute('aria-hidden', 'true');
  button.append(swatch, document.createTextNode(entry.name.toLowerCase()));
  button.onclick = () => {
    selectColor(entry.value, activeColorMenu === 'background');
    colorMenu.close();
  };
  colorMenu.querySelector('.color-menu-options').append(button);
}
for (const name of ['color', 'background']) {
  const select = focusSelect(name);
  select.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'focus-color-menu';
  button.dataset.colorMenu = name;
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = '<span class="color-menu-swatch" aria-hidden="true"></span><span class="color-menu-value"></span><span aria-hidden="true">▾</span>';
  select.after(button);
  button.onclick = () => {
    activeColorMenu = name;
    colorMenu.querySelector('h2').textContent = name;
    for (const option of colorMenu.querySelectorAll('.color-menu-option')) {
      option.setAttribute('aria-pressed', String(option.dataset.color === (name === 'background' ? history.document.background : color)));
    }
    colorMenu.showModal();
    colorMenu.querySelector('[aria-pressed="true"]')?.focus();
  };
}
function syncFocusTools() {
  $('#download').disabled = !ready;
  focusSelect('tool').value = tool;
  focusSelect('size').value = String(size);
  focusSelect('style').value = brushStyle;
  focusSelect('shape').value = brushShape;
  focusSelect('color').value = color;
  focusSelect('background').value = history.document.background;
  for (const name of ['color', 'background']) {
    const value = name === 'background' ? history.document.background : color;
    const label = COLORS.find(entry => entry.value === value).name.toLowerCase();
    const button = sharedTools.querySelector(`[data-color-menu="${name}"]`);
    button.querySelector('.color-menu-swatch').style.backgroundColor = value;
    button.querySelector('.color-menu-value').textContent = label;
    button.setAttribute('aria-label', `${name}: ${label}`);
    button.disabled = !ready;
  }
  for (const select of sharedTools.querySelectorAll('select')) select.disabled = !ready;
  focusSelect('style').disabled = !ready || tool === 'eraser';
  $('#brush-style').disabled = tool === 'eraser';
  const filling = tool === 'brush' && brushStyle === 'fill';
  focusSelect('size').disabled = focusSelect('shape').disabled = !ready || filling;
  $('#brush-shape').disabled = !ready || filling;
  for (const button of document.querySelectorAll('[data-size]')) button.disabled = !ready || filling;
}
focusSelect('tool').onchange = event => selectTool(event.target.value);
focusSelect('size').onchange = event => { selectSize(Number(event.target.value)); };
focusSelect('style').onchange = event => selectStyle(event.target.value);
focusSelect('shape').onchange = event => selectShape(event.target.value);
focusSelect('color').onchange = event => selectColor(event.target.value);
focusSelect('background').onchange = event => selectColor(event.target.value, true);
syncToolViews = () => {
  for (const id of ['brush', 'eraser']) {
    $('#' + id).classList.toggle('selected', id === tool);
    $('#' + id).setAttribute('aria-pressed', String(id === tool));
  }
  for (const button of document.querySelectorAll('[data-size], [data-ink]')) {
    const selected = button.hasAttribute('data-size') ? Number(button.dataset.size) === size : button.dataset.ink === color;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  $('#brush-shape').value = brushShape; $('#brush-style').value = brushStyle;
  $('#color-name').textContent = COLORS.find(entry => entry.value === color).name;
  $('#color-hex').textContent = color;
  for (const update of paletteViews) update();
  syncFocusTools();
};
syncToolViews();
const canvasHome = document.createComment('canvas home');
const historyHome = document.createComment('history home');
const canvasFrame = $('#canvas-frame'), historyActions = $('.history-actions');
canvasFrame.before(canvasHome); historyActions.before(historyHome);
function arrangeNormalStudio() {
  if (focusView.open) return;
  if (stackedLayout.matches) {
    normalInfo.append(sharedInfo);
    normalActions.append(historyActions, focusButton);
    normalTools.append(sharedTools);
  } else {
    focusView.prepend(sharedInfo);
    focusView.append(sharedTools);
    historyHome.after(historyActions);
    launchHome.after(focusButton);
  }
  syncFocusInfo(); syncFocusTools();
}
stackedLayout.addEventListener('change', arrangeNormalStudio);
let focusScroll = 0;
function sizeFocusView() {
  if (!focusView.open) return;
  const viewport = window.visualViewport;
  focusView.style.width = `${Math.max(320, viewport?.width ?? window.innerWidth)}px`;
  focusView.style.height = `${viewport?.height ?? window.innerHeight}px`;
  focusView.style.left = `${viewport?.offsetLeft ?? 0}px`;
  focusView.style.top = `${viewport?.offsetTop ?? 0}px`;
  const area = focusView.querySelector('.focus-canvas');
  const layout = getComputedStyle(focusView);
  const sideTools = window.matchMedia('(orientation:landscape) and (max-height:600px)').matches;
  const sharedHeader = window.matchMedia('(min-width:700px) and (min-height:601px)').matches;
  const infoHeight = sharedInfo.offsetHeight;
  const actionsHeight = focusView.querySelector('.focus-actions').offsetHeight;
  const headerHeight = sharedHeader ? Math.max(infoHeight, actionsHeight) : infoHeight + actionsHeight;
  const availableHeight = sideTools ? area.clientHeight : focusView.clientHeight
    - parseFloat(layout.paddingTop) - parseFloat(layout.paddingBottom)
    - headerHeight
    - focusView.querySelector('.focus-tools').offsetHeight
    - parseFloat(layout.rowGap) * (sharedHeader ? 2 : 3);
  const edge = Math.max(0, Math.min(area.clientWidth, availableHeight) - 2);
  canvasFrame.style.width = canvasFrame.style.height = `${edge}px`;
}
new ResizeObserver(sizeFocusView).observe(focusView.querySelector('.focus-canvas'));
window.visualViewport?.addEventListener('resize', sizeFocusView);
window.visualViewport?.addEventListener('scroll', sizeFocusView);
window.addEventListener('resize', sizeFocusView);
focusButton.onclick = () => {
  if (unsupportedFocusLayout.matches) return;
  focusScroll = window.scrollY;
  for (const picker of document.querySelectorAll('.color-picker')) picker.open = false;
  focusView.prepend(sharedInfo);
  focusView.append(sharedTools);
  focusView.querySelector('.focus-canvas').append(canvasFrame);
  focusView.querySelector('.focus-history').append(historyActions);
  document.documentElement.classList.add('drawing-focused');
  document.body.style.top = `-${focusScroll}px`;
  syncFocusInfo(); focusView.showModal(); syncFocusTools(); sizeFocusView();
  focusView.querySelector('.focus-close').focus();
};
focusView.querySelector('.focus-close').onclick = () => focusView.close();
new MutationObserver(() => {
  if ($('.studio').hidden && focusView.open) focusView.close();
}).observe($('.studio'), { attributes: true, attributeFilter: ['hidden'] });
focusView.addEventListener('close', () => {
  if (active) finish({ pointerId });
  canvasHome.after(canvasFrame); historyHome.after(historyActions);
  canvasFrame.style.removeProperty('width'); canvasFrame.style.removeProperty('height');
  document.documentElement.classList.remove('drawing-focused');
  document.body.style.removeProperty('top');
  arrangeNormalStudio();
  window.scrollTo(0, focusScroll);
  (unsupportedFocusLayout.matches ? canvas : focusButton).focus({ preventScroll: true });
});
function syncFocusAvailability() {
  focusButton.hidden = unsupportedFocusLayout.matches;
  if (!unsupportedFocusLayout.matches) return;
  if (focusView.open) {
    if (colorMenu.open) colorMenu.close();
    focusView.close();
  } else if (document.activeElement === focusButton) {
    canvas.focus({ preventScroll: true });
  }
}
unsupportedFocusLayout.addEventListener('change', syncFocusAvailability);
syncFocusAvailability();
arrangeNormalStudio();

let fitCheckFrame = null;
function schedulePageFitCheck() {
  if (fitCheckFrame !== null) return;
  fitCheckFrame = requestAnimationFrame(() => {
    fitCheckFrame = null;
    // A fixed body inside the modal is not a measurement of the normal page.
    if (focusView.open) return;
    const root = document.documentElement;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    const scrollbarSpace = `${scrollbarWidth}px`;
    if (root.style.getPropertyValue('--page-scrollbar-width') !== scrollbarSpace) {
      root.style.setProperty('--page-scrollbar-width', scrollbarSpace);
    }
    const viewport = window.visualViewport;
    const visibleWidth = Math.min(root.clientWidth, viewport?.width ?? root.clientWidth);
    const visibleHeight = Math.min(root.clientHeight, viewport?.height ?? root.clientHeight);
    const fits = window.matchMedia('(min-width:1101px)').matches
      && !stackedLayout.matches && !$('.studio').hidden
      && root.scrollWidth <= visibleWidth + 1
      && root.scrollHeight <= visibleHeight + 1;
    // Keep keyboard focus visible if a resize makes the focused button redundant.
    if (fits && document.activeElement === focusButton) canvas.focus({ preventScroll: true });
    focusButton.classList.toggle('page-fits', fits);
  });
}
new ResizeObserver(schedulePageFitCheck).observe(document.body);
window.addEventListener('resize', schedulePageFitCheck);
window.visualViewport?.addEventListener('resize', schedulePageFitCheck);
focusView.addEventListener('close', schedulePageFitCheck);
document.fonts.ready.then(schedulePageFitCheck);
schedulePageFitCheck();
