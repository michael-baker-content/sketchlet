export function profileDrawingCursor(value) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error('invalid drawing page'), { status: 400 });
  }
  return value;
}
export function normalizeDisplayName(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('enter a name using up to 32 characters'), { status: 400 });
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (name.length > 32 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw Object.assign(new Error('enter a name using up to 32 characters without hidden control characters'), { status: 400 });
  }
  return name;
}
