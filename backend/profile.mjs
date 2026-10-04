export function normalizeDisplayName(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('enter a name using up to 32 characters'), { status: 400 });
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (name.length > 32 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw Object.assign(new Error('enter a name using up to 32 characters without hidden control characters'), { status: 400 });
  }
  return name;
}
