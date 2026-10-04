export const PUBLIC_FILES = ['index.html', 'styles.css', 'playful.css', 'retro.css', 'flow.css', 'src/studio.js', 'src/model.js', 'src/brushes.js', 'src/gallery.js', 'src/rating-session.js', 'src/prompts.js', 'src/upload-limits.js'];
const files = new Set(PUBLIC_FILES);
export function publicFile(pathname) {
  if (pathname === '/' || pathname === '/gallery' || pathname === '/gallery/' || /^\/d\/[0-9a-f-]{36}$/.test(pathname)) return 'index.html';
  const candidate = pathname.slice(1);
  return files.has(candidate) ? candidate : null;
}
