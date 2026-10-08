import { BRUSH_SHAPES, BRUSH_STYLES } from './brushes.js';
import { validFillRuns } from './fill.js';
export const CANVAS_SIZE = 1200;
export const BRUSH_SIZES = [5, 14, 32];
export const COLORS = [
  { name: 'Midnight', value: '#343044' }, { name: 'Paper', value: '#FFFFFF' },
  { name: 'Lilac', value: '#B39ADB' }, { name: 'Rose', value: '#EAA3B7' },
  { name: 'Peach', value: '#F1B58D' }, { name: 'Butter', value: '#F3D77F' },
  { name: 'Mint', value: '#9ACAB2' }, { name: 'Sky', value: '#93BCE0' },
  { name: 'Black', value: '#17151C' }, { name: 'Charcoal', value: '#4B4854' },
  { name: 'Navy', value: '#24365B' }, { name: 'Plum', value: '#58345F' },
  { name: 'Burgundy', value: '#792D43' }, { name: 'Forest', value: '#285343' },
  { name: 'Teal', value: '#236B70' }, { name: 'Brown', value: '#684635' },
  { name: 'Red', value: '#CE4949' }, { name: 'Orange', value: '#DC853C' },
  { name: 'Gold', value: '#B69435' }, { name: 'Olive', value: '#738244' },
  { name: 'Blue', value: '#4B79C2' }, { name: 'Purple', value: '#8559AE' },
  { name: 'Cream', value: '#FFF3D2' }, { name: 'Gray', value: '#B5B0BC' },
];
export function createDocument() { return { background: '#FFFFFF', strokes: [] }; }
export function draftKey(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid draft day');
  return `prompt-v2:${day}`;
}
export function restoreDraft(record, day) {
  return record?.day === day && validDocument(record.document) ? record.document : createDocument();
}
export function validDocument(doc) {
  return doc && COLORS.some(c => c.value === doc.background) && Array.isArray(doc.strokes) && doc.strokes.every(s => s && (s.tool === 'fill'
    ? COLORS.some(c => c.value === s.color) && validFillRuns(s.runs, CANVAS_SIZE)
    : (
    ['brush', 'eraser'].includes(s.tool) &&
    (s.seed === undefined || (Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 0xffffffff)) &&
    (s.sprayVersion === undefined || [2, 3, 4, 5].includes(s.sprayVersion)) &&
    (s.pencilVersion === undefined || s.pencilVersion === 2) &&
    (s.shape === undefined ? (s.style === undefined || ['solid', 'dashed', 'rough'].includes(s.style)) : BRUSH_SHAPES.includes(s.shape) && (BRUSH_STYLES.includes(s.style) || (s.style === 'line' && s.tool === 'brush' && s.points?.length <= 2))) &&
    COLORS.some(c => c.value === s.color) && BRUSH_SIZES.includes(s.size) &&
    Array.isArray(s.points) && s.points.length > 0 && s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= CANVAS_SIZE)))));
}
export class History {
  constructor(doc = createDocument()) { this.document = doc; this.past = []; this.future = []; }
  commit(doc) { this.past.push(this.document); if (this.past.length > 60) this.past.shift(); this.document = doc; this.future = []; }
  undo() { if (!this.past.length) return false; this.future.push(this.document); this.document = this.past.pop(); return true; }
  redo() { if (!this.future.length) return false; this.past.push(this.document); this.document = this.future.pop(); return true; }
}
