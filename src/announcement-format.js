const escape = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function linkTarget(value) {
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value) || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function youtubeId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}

// Parse only our small formatting vocabulary; never interpret author-supplied HTML.
function inline(text) {
  const tokens = /\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*/g;
  let html = '', end = 0;
  for (const match of text.matchAll(tokens)) {
    html += escape(text.slice(end,match.index));
    if (match[3]) html += `<strong>${inline(match[3])}</strong>`;
    else {
      const href = linkTarget(match[2]);
      html += href ? `<a href="${escape(href)}">${escape(match[1])}</a>` : escape(match[0]);
    }
    end = match.index + match[0].length;
  }
  return html + escape(text.slice(end));
}

export function announcementBody(body) {
  return body.split(/\n\s*\n/).filter(Boolean).map(block => {
    const video = youtubeId(block.trim());
    if (video) return `<figure class="announcement-video"><iframe src="https://www.youtube-nocookie.com/embed/${video}" title="YouTube video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><figcaption><a href="https://www.youtube.com/watch?v=${video}">watch on YouTube</a></figcaption></figure>`;
    const lines = block.split('\n');
    if (lines.every(line => /^-\s+/.test(line))) return '<ul>'+lines.map(line=>'<li>'+inline(line.replace(/^-\s+/,''))+'</li>').join('')+'</ul>';
    return '<p>'+lines.map(inline).join('<br>')+'</p>';
  }).join('');
}
export function announcementPath(item) {
  return `/info#${encodeURIComponent(item.slug || 'announcement-' + item.id)}`;
}
export function announcementMarkup(items) {
  return items.length ? items.map(item => `<article class="announcement" id="${escape(item.slug || 'announcement-' + item.id)}">${item.slug ? `<span id="announcement-${escape(item.id)}" aria-hidden="true"></span>` : ''}<h3><a class="announcement-permalink" href="${escape(announcementPath(item))}">${escape(item.title)}</a></h3><p class="announcement-date"><time datetime="${escape(item.published_at)}">${escape(new Date(item.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}))}</time> · Michael</p>${announcementBody(item.body)}</article>`).join('') : '<p>No announcements have been posted yet.</p>';
}
