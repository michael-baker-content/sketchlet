const main = document.querySelector('main');
const studio = document.querySelector('.studio');
const intro = document.querySelector('.intro');
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nouns = ['mushroom', 'kite', 'house', 'flower', 'moon', 'boat', 'apple', 'tree', 'cat', 'cup', 'cloud', 'fish', 'shoe', 'bird', 'castle', 'leaf', 'cake', 'chair', 'snail', 'hat', 'star'];
const dayNumber = Math.floor(Date.parse(date + 'T12:00:00Z') / 86400000);
const actions = ['laughing', 'crying', 'dancing', 'sleeping', 'sneezing', 'singing', 'jumping', 'waving', 'yawning', 'running', 'hiding', 'skating', 'stretching', 'swimming', 'blushing', 'spinning', 'whistling', 'tumbling', 'floating', 'shivering', 'winking', 'tiptoeing', 'cheering'];
const prompt = `${actions[dayNumber % actions.length]} ${nouns[dayNumber % nouns.length]}`;
const key = `little-canvas-preview:${date}`;
let submission = null, selected = 0, queueIndex = 0;
let votes = {};
try { submission = JSON.parse(localStorage.getItem(key)); votes = JSON.parse(localStorage.getItem('little-canvas-preview-votes') || '{}'); } catch {}
const banner = document.createElement('div');
banner.className = 'preview-notice';
banner.textContent = 'preview · drawings and votes stay on this device';
main.prepend(banner);
intro.innerHTML = `<div class="daily-heading"><div><p class="prompt-date">${date} · today's prompt</p><h1>${prompt}</h1></div><button class="web-button" id="open-archive">archive</button></div><p class="prompt-caption">new prompt at midnight eastern</p>`;
const submitBar = document.createElement('div');
submitBar.className = 'submit-bar';
submitBar.innerHTML = '<span>one drawing per day. make it yours.</span><button class="web-button primary" id="review-drawing">submit drawing</button>';
studio.after(submitBar);
const panel = document.createElement('section');
panel.className = 'flow-panel';
panel.hidden = true;
main.append(panel);
const dialog = document.createElement('dialog');
dialog.className = 'submission-dialog';
dialog.innerHTML = '<form method="dialog"><h2>ready to submit?</h2><p>your drawing will be final for today.</p><p class="muted">this preview saves it only on this device.</p><img alt="your drawing before submission"><p id="submission-error" role="alert"></p><div class="dialog-actions"><button class="web-button" value="cancel">keep drawing</button><button class="web-button primary" id="confirm-submit" type="button">submit drawing</button></div></form>';
document.body.append(dialog);
function focusHeading() { const heading = panel.querySelector('h2'); if (heading) { heading.tabIndex = -1; heading.focus(); } }
function showPanel(content) { studio.hidden = true; submitBar.hidden = true; panel.hidden = false; panel.innerHTML = content; focusHeading(); }
function home() { if (submission) showSubmission(); else { panel.hidden = true; studio.hidden = false; submitBar.hidden = false; } }
function streak() {
  let count = 0;
  try { for (let offset = 0; offset < 3660; offset++) { const d = new Date(Date.parse(date + 'T12:00:00Z') - offset * 86400000).toISOString().slice(0, 10); if (!localStorage.getItem(`little-canvas-preview:${d}`)) break; count++; } } catch {}
  return count;
}
function showSubmission() {
  showPanel(`<div class="panel-title"><h2>today's drawing</h2><span>saved on this device</span></div><div class="submission-layout"><img class="finished-drawing" alt="your submitted drawing of ${prompt}"><div class="submission-info"><h3>${prompt}</h3><p class="rating-total">no ratings yet</p><p class="muted">public sharing and community ratings will be available when the site is connected.</p><div class="streak-box"><strong>${streak()} ${streak() === 1 ? 'day' : 'days'}</strong><span>drawing streak</span></div><button class="web-button primary" id="start-rating">rate sample drawings</button><button class="web-button" id="download-submission">save image</button></div></div>`);
  panel.querySelector('img').src = submission.image;
  document.querySelector('#start-rating').onclick = startRating;
  document.querySelector('#download-submission').onclick = () => { const a = document.createElement('a'); a.href = submission.image; a.download = `${submission.prompt}-${date}.png`; a.click(); };
}
document.querySelector('#review-drawing').onclick = async () => {
  // Let the short trailing drawing animation settle before taking a snapshot.
  await new Promise(resolve => setTimeout(resolve, 80));
  dialog.querySelector('img').src = document.querySelector('#canvas').toDataURL('image/png');
  document.querySelector('#submission-error').textContent = '';
  dialog.showModal();
};
document.querySelector('#confirm-submit').onclick = () => {
  const next = { prompt, date, image: dialog.querySelector('img').src, id: crypto.randomUUID() };
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { document.querySelector('#submission-error').textContent = 'could not save on this device. download a copy or free up browser storage.'; return; }
  submission = next; dialog.close(); showSubmission();
};
const samples = [
  { id: 'flower-1', prompt: 'flower', color: '#fff3d2', path: '<path d="M160 260V140m0 70q-55-45-65-10 25 35 65 25m0-40q50-40 60-10-25 30-60 25" fill="#9acab2" stroke="#285343"/><g fill="#eaa3b7" stroke="#792d43"><ellipse cx="160" cy="93" rx="24" ry="38"/><ellipse cx="199" cy="127" rx="38" ry="24"/><ellipse cx="160" cy="161" rx="24" ry="38"/><ellipse cx="121" cy="127" rx="38" ry="24"/></g><circle cx="160" cy="127" r="23" fill="#f3d77f" stroke="#684635"/>' },
  { id: 'house-1', prompt: 'house', color: '#93bce0', path: '<path d="M0 253q150-30 320 0v67H0" fill="#9acab2" stroke="none"/><path d="M82 148h156v116H82z" fill="#fff3d2"/><path d="m58 149 102-85 103 85z" fill="#ce4949"/><path d="M139 264v-76h43v76" fill="#684635"/><path d="M98 172h27v32H98zm97 0h27v32h-27z" fill="#f3d77f"/>' },
  { id: 'moon-1', prompt: 'moon', color: '#24365b', path: '<path d="M191 65c-83-9-144 107-54 164 50 31 93 0 108-32-80 23-131-70-54-132z" fill="#f3d77f" stroke="#fff3d2"/><path d="m62 65 5 14 14 5-14 5-5 14-5-14-14-5 14-5zm185 24 4 12 13 4-13 4-4 13-4-13-13-4 13-4z" fill="#fff3d2" stroke="none"/>' }
];
function sampleImage(sample) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><rect width="320" height="320" fill="${sample.color}"/><g stroke="#343044" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${sample.path}</g></svg>`); }
let queue = [];
function startRating() { queue = samples.filter(sample => !votes[sample.id]); queueIndex = 0; renderRating(); }
function renderRating() {
  selected = 0;
  const sample = queue[queueIndex];
  if (!sample) {
    showPanel('<div class="panel-title"><h2>all caught up</h2></div><div class="empty-state"><p>that’s all the sample drawings for now.</p><button class="web-button" id="back-home">back to today</button></div>');
    document.querySelector('#back-home').onclick = home; return;
  }
  showPanel(`<div class="panel-title"><h2>rate a drawing</h2><button class="web-button" id="back-home">back to today</button></div><div class="rating-layout"><p class="sample-label">sample drawing · archive prompt: ${sample.prompt}</p><img class="rating-drawing" alt="sample drawing of a ${sample.prompt}"><fieldset class="star-picker"><legend>your rating</legend>${[1,2,3,4,5].map(n => `<label><input type="radio" name="stars" value="${n}" aria-label="${n} ${n === 1 ? 'star' : 'stars'}"><span aria-hidden="true">☆</span></label>`).join('')}</fieldset><p id="rating-status" class="muted" role="status">choose 1–5 stars</p><div class="rating-actions"><button class="web-button" id="skip-rating">skip</button><button class="web-button primary" id="save-rating" disabled>save rating</button></div></div>`);
  panel.querySelector('img').src = sampleImage(sample);
  document.querySelector('#back-home').onclick = home;
  for (const radio of panel.querySelectorAll('[name="stars"]')) radio.onchange = () => { selected = Number(radio.value); panel.querySelectorAll('.star-picker label').forEach((label, i) => { label.querySelector('span').textContent = i < selected ? '★' : '☆'; }); document.querySelector('#save-rating').disabled = false; document.querySelector('#rating-status').textContent = `${selected} ${selected === 1 ? 'star' : 'stars'} selected`; };
  document.querySelector('#skip-rating').onclick = () => { queueIndex++; renderRating(); };
  document.querySelector('#save-rating').onclick = () => {
    try { const next = { ...votes, [sample.id]: selected }; localStorage.setItem('little-canvas-preview-votes', JSON.stringify(next)); votes = next; } catch { document.querySelector('#rating-status').textContent = 'could not save your rating. please try again.'; return; }
    queueIndex++; renderRating();
  };
}
document.querySelector('#open-archive').onclick = () => {
  showPanel(`<div class="panel-title"><h2>archive</h2><button class="web-button" id="back-home">back to today</button></div><p class="archive-note">sample prompts · viewing and rating only</p><div class="archive-grid">${samples.map((sample, i) => `<button class="archive-card" data-sample="${i}"><img src="${sampleImage(sample)}" alt="sample ${sample.prompt} drawing"><span>${sample.prompt}</span><small>${votes[sample.id] ? 'rated on this device' : 'view & rate'}</small></button>`).join('')}</div>`);
  document.querySelector('#back-home').onclick = home;
  for (const button of panel.querySelectorAll('[data-sample]')) button.onclick = () => {
    const sample = samples[Number(button.dataset.sample)];
    if (votes[sample.id]) {
      showPanel(`<div class="panel-title"><h2>${sample.prompt}</h2><button class="web-button" id="back-home">back to today</button></div><div class="rating-layout"><p class="sample-label">sample drawing · archive</p><img class="rating-drawing" alt="sample drawing of a ${sample.prompt}"><p>your rating: ${votes[sample.id]} / 5 stars</p><p class="muted">saved on this device</p></div>`);
      panel.querySelector('img').src = sampleImage(sample);
      document.querySelector('#back-home').onclick = home;
    } else { queue = [sample]; queueIndex = 0; renderRating(); }
  };
};
if (submission?.image && submission?.prompt) showSubmission();
