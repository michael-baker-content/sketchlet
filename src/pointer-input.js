// Coalesced samples share one event's layout snapshot. Do not cache it across
// events: scrolling, resizing and moving the canvas into a dialog can relocate it.
export function canvasPoint(event, rect, size) {
  return [
    Math.max(0, Math.min(size, (event.clientX - rect.left) / rect.width * size)),
    Math.max(0, Math.min(size, (event.clientY - rect.top) / rect.height * size)),
  ];
}

export function appendPointerSamples(points, event, rect, size) {
  const coalesced = event.getCoalescedEvents?.();
  for (const sample of coalesced?.length ? coalesced : [event]) {
    const point = canvasPoint(sample, rect, size), last = points.at(-1);
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) > .5) points.push(point);
  }
}
