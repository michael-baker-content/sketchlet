import { formatPromptDate } from './prompts.js';
import { setCloseIcon } from './close-button.js';
import { counted, drawingCaption } from './text-format.js';

const WIDTH = 1200, HEIGHT = 920;
const FONT = '"Unkempt", cursive';

function bevel(ctx, x, y, width, height, fill, inset = false) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, width, height);
  ctx.lineWidth = 4;
  ctx.strokeStyle = inset ? '#74657f' : '#ffffff';
  ctx.beginPath(); ctx.moveTo(x, y + height); ctx.lineTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
  ctx.strokeStyle = inset ? '#ffffff' : '#74657f';
  ctx.beginPath(); ctx.moveTo(x + width, y); ctx.lineTo(x + width, y + height); ctx.lineTo(x, y + height); ctx.stroke();
}

function text(ctx, value, x, y, width, size, { bold = false, color = '#32124f', minimum = 18 } = {}) {
  ctx.fillStyle = color;
  do { ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`; size--; }
  while (ctx.measureText(value).width > width && size >= minimum);
  // A final ellipsis protects the layout from unusually long names/prompts.
  let label = value;
  if (ctx.measureText(label).width > width) {
    const chars = [...label];
    while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
    label = chars.join('') + '…';
  }
  ctx.fillText(label, x, y);
}

function caption(ctx, value, x, y, width, height) {
  let lines, size = 40;
  for (; size >= 22; size--) {
    ctx.font = `700 ${size}px ${FONT}`;
    lines = [''];
    for (const word of value.split(/\s+/)) {
      let line = lines.at(-1);
      if (line && ctx.measureText(line + ' ' + word).width > width) { lines.push(''); line = ''; }
      if (line) lines[lines.length - 1] += ' ';
      for (const character of word) {
        if (ctx.measureText(lines.at(-1) + character).width > width) lines.push('');
        lines[lines.length - 1] += character;
      }
    }
    if (lines.length * size * 1.25 <= height) break;
  }
  size = Math.max(22,size);
  const maximum = Math.floor(height / (size * 1.25));
  lines.slice(0,maximum).forEach((line,index) => text(ctx,
    index === maximum - 1 && lines.length > maximum ? line + '…' : line,
    x,y + index * size * 1.25,width,size,{bold:true,minimum:size}));
}

export async function createShareCard(drawing, { signal } = {}) {
  const imageUrl = new URL(drawing.image, location.origin);
  if (imageUrl.origin !== location.origin) throw new Error('could not load this drawing.');
  const response = await fetch(imageUrl, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('could not load this drawing. please try again.');
  const imageBlob = await response.blob();
  const objectUrl = URL.createObjectURL(imageBlob);
  const image = new Image();
  try {
    image.src = objectUrl;
    await Promise.all([
      image.decode(),
      document.fonts.load(`400 32px ${FONT}`).catch(() => {}),
      document.fonts.load(`700 64px ${FONT}`).catch(() => {}),
    ]);
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('could not create the card. please try again.');
    ctx.fillStyle = '#d6c6ec'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#ffffff26';
    for (let y = 0; y < HEIGHT; y += 8) for (let x = 0; x < WIDTH; x += 8) {
      if ((x / 8 + y / 8) % 2 === 0) ctx.fillRect(x, y, 8, 8);
    }
    // Leave breathing room around the content for messaging previews.
    // The PNG dimensions stay unchanged; only decorative checks reach its edges.
    const contentScale = .85;
    ctx.save();
    ctx.translate(WIDTH * (1 - contentScale) / 2, HEIGHT * (1 - contentScale) / 2);
    ctx.scale(contentScale, contentScale);
    ctx.beginPath(); ctx.roundRect(24, 24, WIDTH - 48, HEIGHT - 48, 48);
    ctx.fillStyle = '#d5d0d9'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#827294'; ctx.stroke();
    const gradient = ctx.createLinearGradient(56, 0, 310, 0);
    gradient.addColorStop(0, '#4a147b'); gradient.addColorStop(.55, '#743d91'); gradient.addColorStop(1, '#a43f68');
    text(ctx, 'sketchlet', 64, 137, 292, 68, { bold: true, color: gradient });
    text(ctx, formatPromptDate(drawing.date), 64, 183, 292, 29);
    ctx.fillStyle = '#827294'; ctx.fillRect(64, 211, 292, 2); ctx.fillRect(64, 217, 292, 2);
    caption(ctx, drawingCaption(drawing.displayName, drawing.prompt), 64, 273, 292, 300);
    // Keep the artwork square and uncropped; only the enclosing card is rounded.
    bevel(ctx, 384, 80, 760, 760, '#ffffff', true);
    const edge = 752, scale = Math.min(edge / image.naturalWidth, edge / image.naturalHeight);
    const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
    ctx.drawImage(image, 388 + (edge - iw) / 2, 84 + (edge - ih) / 2, iw, ih);
    ctx.fillStyle = '#827294';
    for (const y of [590,730]) ctx.fillRect(64, y, 292, 2);
    const rated = drawing.count > 0 && Number.isFinite(drawing.average);
    text(ctx, rated ? `${drawing.average.toFixed(1)} / 5` : 'not rated yet', 64, 654, 292, rated ? 54 : 36, { bold: true });
    text(ctx, counted(drawing.count || 0, 'rating'), 64, 699, 292, 29);
    text(ctx, 'a little drawing every day', 64, 778, 292, 29, { bold: true });
    text(ctx, location.host, 64, 824, 292, 26, { bold: true });
    ctx.restore();
    return await new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob); else reject(new Error('could not create the card. please try again.'));
    }, 'image/png'));
  } finally { URL.revokeObjectURL(objectUrl); }
}

export function openShareCard(drawing, trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'share-card-dialog';
  dialog.setAttribute('aria-labelledby', 'share-card-title');
  dialog.innerHTML = '<div class="share-card-heading"><h2 id="share-card-title">share card</h2><button class="web-button" data-close aria-label="close share card">close</button></div><p class="share-card-status" role="status">creating your card…</p><img class="share-card-preview" hidden><div class="share-card-actions"><button class="web-button primary" data-copy disabled>copy image</button><a class="web-button" data-download hidden>download png</a><button class="web-button" data-retry hidden>try again</button></div>';
  setCloseIcon(dialog.querySelector('[data-close]'));
  const preview = dialog.querySelector('img');
  preview.alt = `sketchlet card: ${drawingCaption(drawing.displayName, drawing.prompt)}, ${formatPromptDate(drawing.date)}`;
  const status = dialog.querySelector('[role="status"]');
  const copy = dialog.querySelector('[data-copy]');
  const download = dialog.querySelector('[data-download]');
  const retry = dialog.querySelector('[data-retry]');
  let blob = null, previewUrl = null, controller = null;
  const canCopy = !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined' &&
    (!ClipboardItem.supports || ClipboardItem.supports('image/png'));
  async function prepare() {
    controller?.abort(); controller = new AbortController();
    const current = controller;
    status.textContent = 'creating your card…'; retry.hidden = true;
    try {
      const result = await createShareCard(drawing, { signal: current.signal });
      if (!dialog.open || current.signal.aborted) return;
      blob = result; previewUrl = URL.createObjectURL(blob);
      preview.src = previewUrl; preview.hidden = false;
      download.href = previewUrl;
      download.download = `sketchlet-${drawing.date}-${drawing.prompt.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      download.hidden = false; copy.disabled = !canCopy;
      status.textContent = canCopy ? 'ready to copy or download.' : 'image copying is unavailable in this browser. download the png to share it.';
    } catch (error) {
      if (!dialog.open || current.signal.aborted) return;
      status.textContent = 'could not create the card. please try again.';
      retry.hidden = false;
    }
  }
  copy.onclick = async () => {
    if (!blob) return;
    copy.disabled = true;
    try {
      // The PNG is already prepared, so clipboard access starts in the click gesture.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      if (dialog.open) status.textContent = 'image copied! paste it into your message or post.';
    } catch {
      if (dialog.open) status.textContent = 'image copying was blocked. download the png to share it instead.';
    } finally { if (dialog.open) copy.disabled = false; }
  };
  retry.onclick = prepare;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    controller?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    dialog.remove();
    if (trigger.isConnected) trigger.focus();
  }, { once: true });
  document.body.append(dialog); dialog.showModal(); prepare();
}
