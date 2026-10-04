const key = 'sketchlet.ratingSkips';
const lifetime = 30 * 60 * 1000;
const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export function createRatingSkips(storage, now = Date.now) {
  let entries = [];
  try { const value = JSON.parse(storage?.getItem(key) || '[]'); if (Array.isArray(value)) entries = value; } catch {}
  function prune() {
    const time = now();
    entries = entries.filter(entry => entry && validId(entry.id) && Number.isFinite(entry.time) && entry.time <= time && time-entry.time < lifetime).slice(-100);
  }
  function persist() { try { storage?.setItem(key, JSON.stringify(entries)); } catch {} }
  return {
    ids() { prune(); return [...new Set(entries.map(entry => entry.id))]; },
    add(id) { if (!validId(id)) return; prune(); entries = entries.filter(entry => entry.id !== id); entries.push({ id, time: now() }); prune(); persist(); },
    clear() { entries = []; persist(); },
  };
}
