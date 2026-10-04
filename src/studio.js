import { COLORS, createDocument, draftKey, restoreDraft, History } from './model.js';

const $ = s => document.querySelector(s);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const ink = document.createElement('canvas');
ink.width = ink.height = 1200;
const inkCtx = ink.getContext('2d');
const committedInk = document.createElement('canvas');
committedInk.width = committedInk.height = 1200;
const committedCtx = committedInk.getContext('2d');
let renderedStrokes = null;
let history = new History();
let tool = 'brush', color = COLORS[0].value, size = 14, brushStyle = 'solid';
let active = null, pointerId = null, ready = false, db = null, saveTimer, toastTimer;
let promptDay = null, saveQueue = Promise.resolve(), dayQueue = Promise.resolve();
const strokeTiming = new WeakMap();
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const strokeDelay = () => motionPreference.matches ? 0 : 60;
let animationFrame = null;
function animateStroke(stroke, now) {
  const times = strokeTiming.get(stroke);
  if (!times || strokeDelay() === 0) return stroke;
  const cutoff = now - strokeDelay();
  let count = times.length;
  while (count > 0 && times[count - 1] > cutoff) count--;
  return count ? { ...stroke, points: stroke.points.slice(0, count) } : null;
}
const eraserCursor = document.createElement('div');
eraserCursor.className = 'eraser-cursor';
eraserCursor.setAttribute('aria-hidden', 'true');
$('#canvas-frame').append(eraserCursor);
let cursorPoint = null;
function updateEraserCursor(event) {
  if (event) cursorPoint = { x: event.clientX, y: event.clientY, type: event.pointerType };
  const rect = canvas.getBoundingClientRect();
  const visible = tool === 'eraser' && cursorPoint &&
    cursorPoint.x >= rect.left && cursorPoint.x <= rect.right &&
    cursorPoint.y >= rect.top && cursorPoint.y <= rect.bottom &&
    (cursorPoint.type !== 'touch' || active);
  eraserCursor.classList.toggle('visible', !!visible);
  canvas.style.cursor = tool === 'eraser' ? 'none' : 'crosshair';
  if (!visible) return;
  eraserCursor.style.width = `${size / 1200 * rect.width}px`;
  eraserCursor.style.height = `${size / 1200 * rect.height}px`;
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
  const now = performance.now();
  const trailing = history.document.strokes.filter(stroke => {
    const times = strokeTiming.get(stroke);
    return times && times.at(-1) > now - strokeDelay();
  });
  if (renderedStrokes !== history.document.strokes) {
    committedCtx.clearRect(0, 0, 1200, 1200);
    for (const stroke of history.document.strokes) if (!trailing.includes(stroke)) drawStroke(committedCtx, stroke);
    renderedStrokes = trailing.length ? null : history.document.strokes;
  }
  inkCtx.clearRect(0, 0, 1200, 1200);
  inkCtx.drawImage(committedInk, 0, 0);
  for (const stroke of [...trailing, ...(active ? [active] : [])]) {
    const visible = animateStroke(stroke, now);
    if (visible) drawStroke(inkCtx, visible);
  }
  ctx.fillStyle = history.document.background; ctx.fillRect(0, 0, 1200, 1200); ctx.drawImage(ink, 0, 0);
  $('#canvas-hint').classList.toggle('hidden', history.document.strokes.length > 0 || !!active);
  if ((trailing.length || active) && animationFrame === null) animationFrame = requestAnimationFrame(() => { animationFrame = null; render(); });
}
function syncControls() {
  $('#undo').disabled = !history.past.length; $('#redo').disabled = !history.future.length;
  $('#clear').disabled = !history.document.strokes.length;
  for (const button of document.querySelectorAll('[data-background]')) { const selected = button.dataset.background === history.document.background; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); }
}
function hideDraftStatus() { $('#save-status').hidden = true; }
function changed() { hideDraftStatus(); render(); syncControls(); scheduleSave(); }
function selectTool(next) { tool = next; for (const id of ['brush', 'eraser']) { $('#' + id).classList.toggle('selected', id === tool); $('#' + id).setAttribute('aria-pressed', id === tool); } updateEraserCursor(); }
for (const entry of COLORS) {
  for (const background of [false, true]) {
    const button = document.createElement('button'); button.className = 'swatch'; button.style.setProperty('--color', entry.value); button.style.setProperty('--check', entry.name === 'Midnight' ? '#FFFFFF' : '#343044');
    button.title = entry.name.toLowerCase(); button.setAttribute('aria-label', `${entry.name.toLowerCase()} ${background ? 'background' : 'ink'}`); button.setAttribute('aria-pressed', false);
    if (background) button.dataset.background = entry.value; else button.dataset.ink = entry.value;
    button.addEventListener('click', () => {
      if (!ready) return;
      if (background) { if (history.document.background === entry.value) return; history.commit({ ...history.document, background: entry.value }); changed(); }
      else { color = entry.value; selectTool('brush'); $('#color-name').textContent = entry.name; $('#color-hex').textContent = entry.value; for (const b of document.querySelectorAll('[data-ink]')) { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); } }
    });
    $(background ? '#background-palette' : '#palette').append(button);
  }
}
document.querySelector('[data-ink]').classList.add('selected'); document.querySelector('[data-ink]').setAttribute('aria-pressed', true);
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
    for (const button of palette.querySelectorAll('.swatch')) {
      const hex = button.dataset.background || button.dataset.ink;
      const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16));
      button.style.setProperty('--check', rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 < 140 ? '#FFFFFF' : '#343044');
    }
  };
  palette.addEventListener('click', event => { if (!event.target.closest('button')) return; update(); picker.open = false; summary.focus(); });
  picker.addEventListener('toggle', () => { if (picker.open) for (const other of document.querySelectorAll('.color-picker')) if (other !== picker) other.open = false; });
  picker.addEventListener('keydown', event => { if (event.key === 'Escape') { picker.open = false; summary.focus(); } });
  new MutationObserver(update).observe(palette, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
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
const midButton = document.querySelector('[data-size="14"]');
midButton.querySelector('span').textContent = 'mid';
midButton.setAttribute('aria-label', 'mid brush');
const styleSection = document.createElement('div');
styleSection.className = 'tool-section brush-style-section';
styleSection.innerHTML = '<div class="section-label"><h2>brush style</h2></div><div class="brush-styles" role="group" aria-label="brush style"><button data-style="solid" class="selected" aria-pressed="true"><svg viewBox="0 0 56 20" aria-hidden="true"><path d="M5 10h46"/></svg>solid</button><button data-style="dashed" aria-pressed="false"><svg viewBox="0 0 56 20" aria-hidden="true"><path d="M5 10h46" stroke-dasharray="8 8"/></svg>dashed</button><button data-style="rough" aria-pressed="false"><svg viewBox="0 0 56 20" aria-hidden="true"><path d="m4 11 5-4 4 4 5-3 5 4 5-5 5 3 5-2 4 4 5-4 5 3"/></svg>rough</button></div>';
document.querySelector('.sizes').closest('.tool-section').after(styleSection);
for (const button of styleSection.querySelectorAll('[data-style]')) button.onclick = () => {
  brushStyle = button.dataset.style;
  selectTool('brush');
  for (const other of styleSection.querySelectorAll('[data-style]')) { other.classList.toggle('selected', other === button); other.setAttribute('aria-pressed', other === button); }
};
for (const b of document.querySelectorAll('[data-size]')) b.onclick = () => { size = Number(b.dataset.size); for (const other of document.querySelectorAll('[data-size]')) { other.classList.toggle('selected', b === other); other.setAttribute('aria-pressed', b === other); } };
$('#undo').onclick = () => { if (ready && !active && history.undo()) changed(); };
$('#redo').onclick = () => { if (ready && !active && history.redo()) changed(); };
$('#clear').onclick = () => { if (!ready || active || !history.document.strokes.length) return; history.commit({ ...history.document, strokes: [] }); changed(); toast('Fresh canvas. Undo brings your drawing back.'); };
function point(event) { const rect = canvas.getBoundingClientRect(); return [Math.max(0, Math.min(1200, (event.clientX - rect.left) / rect.width * 1200)), Math.max(0, Math.min(1200, (event.clientY - rect.top) / rect.height * 1200))]; }
canvas.addEventListener('pointerdown', event => {
  if (!ready || active || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  hideDraftStatus();
  event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
  active = { tool, color, size, style: brushStyle, points: [point(event)] };
  strokeTiming.set(active, [performance.now()]);
  render();
});
let frame = null;
canvas.addEventListener('pointermove', event => {
  if (!active || event.pointerId !== pointerId) return;
  const samples = event.getCoalescedEvents?.();
  for (const e of samples?.length ? samples : [event]) { const p = point(e); const last = active.points.at(-1); if (Math.hypot(p[0]-last[0],p[1]-last[1]) > .5) { active.points.push(p); strokeTiming.get(active).push(performance.now()); } }
  if (frame === null) frame = requestAnimationFrame(() => { frame = null; render(); });
});
function finish(event) { if (!active || event.pointerId !== pointerId) return; history.commit({ ...history.document, strokes: [...history.document.strokes, active] }); active = null; pointerId = null; changed(); }
canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
document.addEventListener('keydown', event => {
  if (!ready || active || event.altKey || canvas.closest('[hidden]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey ? history.redo() : history.undo()) changed(); }
});
$('#download').onclick = () => {
  // Export the complete document, including any points still finishing their animation.
  for (const stroke of history.document.strokes) strokeTiming.delete(stroke);
  renderedStrokes = null;
  render(); canvas.toBlob(blob => { if (!blob) { toast('Could not save the image. Please try again.'); return; } const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sketchlet.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); toast('PNG downloaded.'); }, 'image/png');
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
    db = await new Promise((resolve, reject) => { const req = indexedDB.open('little-canvas', 1); req.onupgradeneeded = () => req.result.createObjectStore('drafts'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); req.onblocked = () => reject(new Error('Storage blocked')); });
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
    ready = false; $('.toolbox').inert = true; clearTimeout(saveTimer);
    if (active) { history.commit({ ...history.document, strokes: [...history.document.strokes, active] }); active = null; pointerId = null; }
    await persist();
    promptDay = day; history = new History(); renderedStrokes = null; cursorPoint = null;
    $('#save-status').hidden = false;
    render(); syncControls(); updateEraserCursor();
    try {
      const saved = db ? await new Promise((resolve, reject) => {
        const req = db.transaction('drafts').objectStore('drafts').get(draftKey(day));
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      }) : null;
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
  for (const stroke of history.document.strokes) strokeTiming.delete(stroke);
  renderedStrokes = null; render();
  return { date: promptDay, image: canvas.toDataURL('image/png') };
}

// Move the existing canvas into a modal workspace; its pixels, listeners and
// history stay intact. Native selects keep menus within the device's own UI.
const focusButton = document.createElement('button');
focusButton.className = 'web-button focus-launch';
focusButton.textContent = 'full screen';
focusButton.setAttribute('aria-haspopup', 'dialog');
$('.studio-top').append(focusButton);
const focusView = document.createElement('dialog');
focusView.className = 'drawing-focus';
focusView.setAttribute('aria-label', 'full screen drawing');
focusView.innerHTML = `<div class="focus-info"><div class="focus-info-top"><p class="focus-date"><span class="focus-brand">sketchlet * </span><span class="focus-date-value"></span></p></div><h2 class="focus-prompt"></h2></div>
  <div class="focus-actions"><div class="focus-history"></div><button class="web-button focus-close" aria-label="close full screen drawing">×</button></div>
  <div class="focus-canvas"></div>
  <div class="focus-tools" aria-label="drawing tools">
    <label>tools<select data-focus="tool"><option value="brush">draw</option><option value="eraser">erase</option></select></label>
    <label>brush size<select data-focus="size"><option value="5">fine</option><option value="14">mid</option><option value="32">bold</option></select></label>
    <label>brush style<select data-focus="style"><option>solid</option><option>dashed</option><option>rough</option></select></label>
    <label>color<select data-focus="color"></select></label>
    <label>background<select data-focus="background"></select></label>
  </div>`;
document.body.append(focusView);
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
// Keep this aligned with the stacked studio breakpoint in flow.css.
const stackedLayout = window.matchMedia('(max-width:760px), (min-width:761px) and (max-width:1100px) and (orientation:portrait)');
function syncFocusInfo() {
  const date = $('.prompt-date')?.textContent.split(' · ')[0] ?? '';
  sharedInfo.querySelector('.focus-date-value').textContent = date;
  sharedInfo.querySelector('.focus-prompt').textContent = `today's prompt: ${$('.daily-heading h1')?.textContent ?? ''}`;
}
const focusInfoObserver = new MutationObserver(syncFocusInfo);
focusInfoObserver.observe($('.intro'), { subtree: true, childList: true, characterData: true });
const focusSelect = name => sharedTools.querySelector(`[data-focus="${name}"]`);
for (const name of ['color', 'background']) for (const entry of COLORS) {
  const option = document.createElement('option');
  option.value = entry.value; option.textContent = entry.name.toLowerCase();
  focusSelect(name).append(option);
}
function syncFocusTools() {
  focusSelect('tool').value = tool;
  focusSelect('size').value = String(size);
  focusSelect('style').value = brushStyle;
  focusSelect('color').value = color;
  focusSelect('background').value = history.document.background;
  for (const name of ['color', 'background']) focusSelect(name).style.borderLeftColor = focusSelect(name).value;
  for (const select of sharedTools.querySelectorAll('select')) select.disabled = !ready;
}
focusSelect('tool').onchange = event => { selectTool(event.target.value); syncFocusTools(); };
focusSelect('size').onchange = event => { document.querySelector(`[data-size="${event.target.value}"]`).click(); syncFocusTools(); };
focusSelect('style').onchange = event => { document.querySelector(`[data-style="${event.target.value}"]`).click(); syncFocusTools(); };
focusSelect('color').onchange = event => { document.querySelector(`[data-ink="${event.target.value}"]`).click(); syncFocusTools(); };
focusSelect('background').onchange = event => { document.querySelector(`[data-background="${event.target.value}"]`).click(); syncFocusTools(); };
new MutationObserver(syncFocusTools).observe($('.toolbox'), {
  subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'inert'],
});
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
  focusButton.focus({ preventScroll: true });
});
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
