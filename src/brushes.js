export const BRUSH_SHAPES = ['circle', 'square', 'rough'];
export const BRUSH_STYLES = ['brush', 'dashed', 'dotted', 'marker', 'spray', 'pencil'];
const roughRadii = [.96, .73, 1, .78, .94, .7, .98, .8, .91];
export const roughVertices = roughRadii.map((radius, index) => {
  const angle = index / roughRadii.length * Math.PI * 2;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
});

// Samples follow distance, not pointer-event frequency or elapsed time.
export function* strokeSamples(points, spacing) {
  yield { x: points[0][0], y: points[0][1], distance: 0, index: 0 };
  let next = spacing, traveled = 0, index = 1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= traveled + length && length > 0) {
      const fraction = (next - traveled) / length;
      yield { x: a[0] + (b[0] - a[0]) * fraction, y: a[1] + (b[1] - a[1]) * fraction, distance: next, index: index++ };
      next += spacing;
    }
    traveled += length;
  }
}

export function insideShape(shape, x, y) {
  if (shape === 'square') return Math.abs(x) <= 1 && Math.abs(y) <= 1;
  if (shape === 'circle') return x * x + y * y <= 1;
  let inside = false;
  for (let i = 0, j = roughVertices.length - 1; i < roughVertices.length; j = i++) {
    const [ax, ay] = roughVertices[i], [bx, by] = roughVertices[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function random(seed) {
  let value = seed | 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) | 0;
    return (value >>> 0) / 4294967296;
  };
}

export function sprayParticles(sample, shape, size, count = 10) {
  const next = random(sample.index + 137);
  const particles = [];
  for (let attempt = 0; particles.length < count && attempt < count * 10; attempt++) {
    const x = next() * 2 - 1, y = next() * 2 - 1;
    if (insideShape(shape, x, y)) particles.push([sample.x + x * size / 2, sample.y + y * size / 2]);
  }
  return particles;
}

function stamp(context, shape, x, y, radius) {
  if (shape === 'circle') {
    context.moveTo(x + radius, y);
    context.arc(x, y, radius, 0, Math.PI * 2);
  } else if (shape === 'square') {
    context.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    roughVertices.forEach(([px, py], i) => {
      if (i === 0) context.moveTo(x + px * radius, y + py * radius);
      else context.lineTo(x + px * radius, y + py * radius);
    });
    context.closePath();
  }
}

export function pencilParticles(sample, shape, size, seed) {
  const next = random((seed ^ Math.imul(sample.index + 1, 0x9e3779b1)) >>> 0);
  const particles = [], count = Math.min(96, Math.max(8, Math.ceil(size * size * .13)));
  for (let attempt = 0; particles.length < count && attempt < count * 12; attempt++) {
    const x = next() * 2 - 1, y = next() * 2 - 1;
    if (!insideShape(shape, x, y)) continue;
    particles.push({ x: sample.x + x * size / 2, y: sample.y + y * size / 2, width: .7 + next() * .9, alpha: .12 + next() * .22 });
  }
  return particles;
}

export function createBrushRenderer(makeCanvas) {
  const pencilTextures = new Map();
  function pencilTexture(context, color) {
    if (!pencilTextures.has(color)) {
      const tile = makeCanvas(); tile.width = tile.height = 64;
      const grain = tile.getContext('2d'), next = random(419);
      grain.fillStyle = color;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const density = next();
        if (density < .48) continue;
        grain.globalAlpha = .25 + density * .7;
        grain.fillRect(x, y, 1, 1);
      }
      pencilTextures.set(color, context.createPattern(tile, 'repeat'));
    }
    return pencilTextures.get(color);
  }
  return function draw(context, stroke) {
    const erasing = stroke.tool === 'eraser';
    const style = erasing ? 'brush' : stroke.style;
    const lightSpray = style === 'spray' && stroke.sprayVersion === 3;
    const spacing = style === 'dotted' ? stroke.size * 1.8 : style === 'spray' ? Math.max(1, stroke.size * (lightSpray ? .45 : .3)) : Math.max(.75, stroke.size * .12);
    context.save();
    context.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    if (style === 'pencil' && stroke.seed !== undefined) {
      context.fillStyle = stroke.color;
      for (const sample of strokeSamples(stroke.points, spacing)) {
        context.save();
        context.beginPath();
        stamp(context, stroke.shape, sample.x, sample.y, stroke.size / 2);
        context.clip();
        for (const grain of pencilParticles(sample, stroke.shape, stroke.size, stroke.seed)) {
          context.globalAlpha = grain.alpha;
          context.fillRect(grain.x - grain.width / 2, grain.y - grain.width / 2, grain.width, grain.width);
        }
        context.restore();
      }
      context.restore(); return;
    }
    // Unseeded pencil strokes retain the old paper texture in existing drafts.
    context.globalAlpha = style === 'marker' ? .32 : style === 'spray' ? (lightSpray ? .2 : .48) : 1;
    context.fillStyle = style === 'pencil' ? pencilTexture(context, stroke.color) : stroke.color;
    context.beginPath();
    for (const sample of strokeSamples(stroke.points, spacing)) {
      if (style === 'dashed' && sample.distance % (stroke.size * 4.5) >= stroke.size * 2.5) continue;
      if (style === 'spray') {
        const shapedDots = stroke.sprayVersion >= 2;
        const radius = shapedDots ? ({ 5: 1.5, 14: 3, 32: 5 }[stroke.size] / 2) : Math.max(.45, stroke.size * .025);
        for (const [x, y] of sprayParticles(sample, stroke.shape, stroke.size, lightSpray ? 3 : 10)) {
          stamp(context, shapedDots ? stroke.shape : 'circle', x, y, radius);
        }
      } else stamp(context, stroke.shape, sample.x, sample.y, stroke.size / 2);
    }
    // One fill per stroke keeps marker overlaps within a stroke uniform.
    context.fill();
    context.restore();
  };
}
