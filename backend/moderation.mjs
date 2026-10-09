import { reportReasons, removalReasons } from '../src/moderation-options.js';
import { httpError } from './http.mjs';

export const drawingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function text(value, maximum) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum) throw httpError(400, `text must be at most ${maximum} characters`);
  return value.trim();
}
export function reportInput(input) {
  if (typeof input.category !== 'string' || !Object.hasOwn(reportReasons, input.category)) throw httpError(400, 'choose a report reason');
  return { category:input.category, explanation:text(input.explanation, 1000) };
}
export function moderationNote(value) { return text(value,2000); }
export function moderationInput(input) {
  if (!['hide','restore','clear_name'].includes(input.action)) throw httpError(400, 'choose a moderation action');
  if (input.action === 'hide' && (typeof input.reason !== 'string' || !Object.hasOwn(removalReasons, input.reason))) throw httpError(400, 'choose a removal reason');
  return { action:input.action, reason:input.action === 'hide' ? removalReasons[input.reason] : '', note:moderationNote(input.note) };
}
export function reviewCursor(value) {
  if (!value) return null;
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value)>9223372036854775807n) throw httpError(400, 'invalid review cursor');
  return value;
}
export function drawingCursor(value) {
  if (!value) return null;
  if (!drawingIdPattern.test(value)) throw httpError(400, 'invalid drawing cursor');
  return value;
}
