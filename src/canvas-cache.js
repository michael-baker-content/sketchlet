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
