const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function compactId(id) {
  if (!UUID.test(id)) throw new Error('Invalid drawing ID');
  const bytes = id.replaceAll('-', '').match(/../g).map(byte => parseInt(byte, 16));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function drawingPath(id, prompt) {
  const slug = String(prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '') || 'drawing';
  // Preserve every ID bit; shortening by truncation could create collisions.
  return `/d/${slug}~${compactId(id)}`;
}

export function drawingIdFromPath(pathname) {
  const legacy = pathname.match(/^\/d\/([^/]+)\/?$/)?.[1];
  if (legacy && UUID.test(legacy)) return legacy.toLowerCase();
  const token = pathname.match(/^\/d\/[a-z0-9]+(?:-[a-z0-9]+)*~([A-Za-z0-9_-]{22})\/?$/)?.[1];
  if (!token) return null;
  const bytes = atob(token.replaceAll('-', '+').replaceAll('_', '/') + '==');
  const hex = [...bytes].map(byte => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  // Reject aliases whose unused base64 padding bits are nonzero.
  return compactId(id) === token ? id : null;
}
