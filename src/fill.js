// Four-connected flood fill of the visible canvas. Store horizontal runs rather
// than a bitmap or a seed: later background edits must not change the filled area.
export function fillRuns({ data, width, height }, x, y, color, tolerance = 24) {
  x = Math.max(0, Math.min(width - 1, Math.floor(x)));
  y = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const start = y * width + x, offset = start * 4;
  const target = Array.from(data.slice(offset, offset + 4));
  const replacement = color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  if (target[3] === 255 && replacement.every((value, i) => value === target[i])) return [];
  const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let head = 0, tail = 0;
  function visit(index) {
    if (seen[index]) return;
    seen[index] = 1;
    const p = index * 4;
    for (let c = 0; c < 4; c++) if (Math.abs(data[p + c] - target[c]) > tolerance) return;
    seen[index] = 2; queue[tail++] = index;
  }
  visit(start);
  while (head < tail) {
    const p = queue[head++], col = p % width;
    if (col) visit(p - 1);
    if (col + 1 < width) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p + width < seen.length) visit(p + width);
  }
  const runs = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (seen[row * width + col] !== 2) continue;
      const first = col;
      while (col + 1 < width && seen[row * width + col + 1] === 2) col++;
      runs.push(row, first, col - first + 1);
    }
  }
  return runs;
}

export function drawFill(context, action) {
  context.save();
  context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
  context.fillStyle = action.color;
  context.beginPath();
  for (let i = 0; i < action.runs.length; i += 3) {
    context.rect(action.runs[i + 1], action.runs[i], action.runs[i + 2], 1);
  }
  context.fill(); context.restore();
}

export function validFillRuns(runs, size) {
  if (!Array.isArray(runs) || !runs.length || runs.length % 3 || runs.length > size * size * 3) return false;
  let lastRow = -1, end = 0;
  for (let i = 0; i < runs.length; i += 3) {
    const [row, x, length] = runs.slice(i, i + 3);
    if (![row, x, length].every(Number.isInteger) || row < 0 || row >= size || x < 0 || length < 1 || x + length > size || row < lastRow || (row === lastRow && x < end)) return false;
    lastRow = row; end = x + length;
  }
  return true;
}
