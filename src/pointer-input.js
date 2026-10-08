// Coalesced samples share one event's layout snapshot. Do not cache it across
// events: scrolling, resizing and moving the canvas into a dialog can relocate it.
export const TOUCH_OFFSET = 24;
export function pointerPosition(event) {
  return { x: event.clientX, y: event.clientY - (event.pointerType === 'touch' ? TOUCH_OFFSET : 0) };
}
export function canvasPoint(event, rect, size) {
  const position = pointerPosition(event);
  return [
    Math.max(0, Math.min(size, (position.x - rect.left) / rect.width * size)),
    Math.max(0, Math.min(size, (position.y - rect.top) / rect.height * size)),
  ];
}

export function appendPointerSamples(points, event, rect, size) {
  const coalesced = event.getCoalescedEvents?.();
  for (const sample of coalesced?.length ? coalesced : [event]) {
    const point = canvasPoint({ clientX: sample.clientX, clientY: sample.clientY, pointerType: event.pointerType }, rect, size), last = points.at(-1);
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) > .5) points.push(point);
  }
}
