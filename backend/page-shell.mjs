import { informationPages } from './information-pages.mjs';
// Server/build-only template. Values are fixed page definitions, never user input.
const pages = new Map([
  ['index.html', { title:'sketchlet - a little drawing every day', label:'today', script:'/src/home-page.js' }],
  ['gallery.html', { title:'gallery — sketchlet', label:'gallery', script:'/src/gallery-page.js' }],
  ['free-draw.html', { title:'free draw — sketchlet', label:'free draw', script:'/src/free-draw-page.js' }],
  ['admin.html', { title:'admin — sketchlet', label:'administration', script:'/src/admin-page.js' }],
  ['profile.html', { title:'profile — sketchlet', label:'profile', script:'/src/profile-page.js', draft:true }],
]);
for (const [slug, page] of informationPages) pages.set(`${slug}.html`, { ...page, title:`${page.label} — sketchlet`, draft:page.draft !== false });

export const PAGE_FILES = [...pages.keys()];

// null means this public asset is a source file rather than a generated page.
export function renderPageShell(file) {
  const page = pages.get(file);
  if (!page) return null;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5f2fc">
  <title>${page.title}</title>
  ${file === 'admin.html' || page.draft ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <link rel="icon" type="image/svg+xml" href="/src/assets/favicon.svg">
  ${page.content ? '' : '<script src="/src/loading.js"></script>'}
  <link rel="stylesheet" href="/src/styles/base.css">
  <link rel="stylesheet" href="/src/styles/playful.css">
  <link rel="stylesheet" href="/src/styles/retro.css">
  <link rel="stylesheet" href="/src/styles/flow.css">
  <link rel="stylesheet" href="/src/styles/content.css">
  <link rel="stylesheet" href="/src/styles/loading.css">
</head>
<body>
  <a class="skip-link" href="#main-content">skip to content</a>
  <div id="page-loader" role="status" aria-live="polite"${page.content ? ' hidden' : ''}>
    <svg class="loading-sketch" viewBox="0 0 140 48" aria-hidden="true"><path pathLength="1" d="M8 34 Q28 4 42 26 T75 22 T104 26 L130 14 M12 41 Q65 35 124 40"/></svg>
    <p id="loading-message">loading sketchlet…</p>
    <button id="loading-retry" class="web-button" hidden>try again</button>
  </div>
  ${page.content ? '' : '<noscript><p>Please enable javascript to use sketchlet.</p></noscript>'}
  <header class="site-header">
    <a class="brand" href="/" aria-label="sketchlet home">sketchlet</a>
    <nav aria-label="main navigation"><a id="open-home" href="/">home</a><a id="open-archive" href="/gallery">gallery</a><a href="/profile"${file === 'profile.html' ? ' aria-current="page"' : ''}>profile</a><a href="/info"${file === 'info.html' ? ' aria-current="page"' : ''}>info</a></nav>
  </header>
  <main id="main-content" tabindex="-1">
    <section id="page-content" class="flow-panel" aria-labelledby="page-heading">
      <div class="panel-title"><h1 id="page-heading">${page.label}</h1></div>
      ${page.content ? `<article class="information-copy">${page.draft ? '<p class="draft-notice"><strong>Draft for review</strong> · updated oct. 10, 2026. This page is not a finalized policy.</p>' : ''}${page.content}</article>` : '<div class="empty-state" role="status">loading…</div>'}
    </section>
  </main>
  <footer class="site-footer">
    <nav aria-label="footer navigation">${[...informationPages].map(([slug, info]) => `<a href="/${slug}"${file === `${slug}.html` ? ' aria-current="page"' : ''}>${info.label.replace('&', '&amp;')}</a>`).join('')}</nav>
    <small>© 2026 Michael Baker</small>
  </footer>
  <div id="toast" role="status" class="toast"></div>
  <script type="module" src="/src/page-background.js"></script>
  ${page.script ? `<script type="module" src="${page.script}"></script>` : ''}
</body>
</html>
`;
}
