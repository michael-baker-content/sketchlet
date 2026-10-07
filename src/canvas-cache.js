import { createStrokeSampler } from './brushes.js';

// Only seeded pencil deposits are independently cumulative. Other styles must
// keep their single-fill semantics, including antialiased opaque edges.
export function createActivePencilCache(context, size, draw) {
  let current = null, base = null, samples = null;
  return {
    invalidate() { current = base = samples = null; },
    sync(stroke, strokes, committedCanvas) {
      const supported = stroke?.tool === 'brush' && stroke.shape !== undefined &&
        stroke.style === 'pencil' && stroke.seed !== undefined;
      if (!supported) { this.invalidate(); return false; }
      if (current !== stroke || base !== strokes) {
        this.invalidate();
        context.clearRect(0, 0, size, size);
        context.drawImage(committedCanvas, 0, 0);
        samples = createStrokeSampler(Math.max(.75, stroke.size * .12));
        current = stroke; base = strokes;
      }
      try { draw(context, stroke, samples(stroke.points)); }
      catch (error) { this.invalidate(); throw error; }
      return true;
    },
  };
}

// Completed strokes are immutable. Reuse their pixels while the document grows;
// undo, clear, or a different history branch must replay the remaining strokes.
export function createStrokeCache(context, size, drawStroke) {
  let rendered = null;
  return {
    invalidate() { rendered = null; },
    sync(strokes) {
      if (rendered === strokes) return;
      const appendOnly = rendered !== null && rendered.length <= strokes.length &&
        rendered.every((stroke, index) => stroke === strokes[index]);
      const start = appendOnly ? rendered.length : 0;
      // Do not retain a valid cache marker if drawing throws partway through.
      rendered = null;
      if (!appendOnly) context.clearRect(0, 0, size, size);
      for (let i = start; i < strokes.length; i++) drawStroke(context, strokes[i]);
      rendered = strokes;
    },
  };
}

export function watchCanvasRecovery(contexts, invalidate, redraw) {
  const lost = new Set();
  for (const context of contexts) {
    context.canvas.addEventListener('contextlost', () => {
      lost.add(context);
      invalidate();
    });
    context.canvas.addEventListener('contextrestored', () => {
      lost.delete(context);
      invalidate();
      if (available()) redraw();
    });
  }
  function available() {
    if (lost.size || contexts.some(context => context.isContextLost?.())) {
      invalidate();
      return false;
    }
    return true;
  }
  return available;
}
