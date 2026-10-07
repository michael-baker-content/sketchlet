import { drawingIdFromPath } from '../src/drawing-links.js';
export const PUBLIC_FILES = ['index.html', 'gallery.html', 'src/editor.html', 'src/home-page.js', 'src/gallery-page.js', 'src/page-startup.js', 'src/api-client.js', 'src/submission.js', 'src/styles/base.css', 'src/styles/playful.css', 'src/styles/retro.css', 'src/styles/flow.css', 'src/studio.js', 'src/model.js', 'src/brushes.js', 'src/fill.js', 'src/canvas-cache.js', 'src/pointer-input.js', 'src/gallery.js', 'src/rating-session.js', 'src/prompts.js', 'src/drawing-links.js', 'src/share-card.js', 'src/close-button.js', 'src/upload-limits.js'];
PUBLIC_FILES.push('src/loading.js', 'src/styles/loading.css', 'src/draft-storage.js', 'src/assets/favicon.svg');
const files = new Set(PUBLIC_FILES);
export function publicFile(pathname) {
  if (pathname === '/') return 'index.html';
  if (pathname === '/gallery' || pathname === '/gallery/' || drawingIdFromPath(pathname)) return 'gallery.html';
  const candidate = pathname.slice(1);
  return files.has(candidate) ? candidate : null;
}
