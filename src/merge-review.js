import { formatPromptDate } from './prompts.js';

export const linkingNotice = `<div class="content-notice content-notice--important">
  <strong>Linking is permanent.</strong>
  <ul><li><strong>Choose one drawing per date.</strong> Unselected drawings are hidden from galleries and shared links, but retained with a “not selected during account merge” label.</li>
  <li><strong>Selected drawings keep their links and received ratings.</strong> Your account name applies to linked drawings.</li>
  <li>Duplicate ratings are combined, and ratings on your own work are removed. Moderation removals remain in effect.</li></ul>
</div>`;

// Both local guest linking and transfer codes use the same explicit choices.
export function renderMergeReview(root, drawings, onChange = () => {}) {
  root.replaceChildren();
  const groups = [];
  for (const drawing of drawings) {
    const item = document.createElement('li');
    if (!drawing.conflict) {
      item.textContent = `${formatPromptDate(drawing.date)} — ${drawing.prompt} — would be linked`;
    } else {
      const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = `${formatPromptDate(drawing.date)} — ${drawing.prompt} — choose one to keep`;
      fieldset.append(legend);
      const options = document.createElement('div'); options.className = 'merge-options';
      const radios = [];
      for (const [id,image,title] of [[drawing.existingId,drawing.existingImage,'account drawing'],[drawing.id,drawing.image,'incoming drawing']]) {
        const label = document.createElement('label'), radio = document.createElement('input'), text = document.createElement('span');
        radio.type = 'radio'; radio.name = `${root.id || 'transfer'}-${drawing.id}`; radio.value = id;
        text.textContent = title; label.append(radio,text);
        if (image) {
          const img = document.createElement('img'); img.src = image; img.alt = `${title}: ${drawing.prompt}`; img.width = img.height = 160; img.loading = 'lazy';
          img.onerror = () => { img.hidden = true; };
          label.append(img);
        } else {
          const unavailable = document.createElement('small'); unavailable.textContent = 'preview unavailable; removed drawings stay removed'; label.append(unavailable);
        }
        radio.onchange = onChange; radios.push(radio); options.append(label);
      }
      fieldset.append(options); item.append(fieldset); groups.push({id:drawing.id,radios});
    }
    root.append(item);
  }
  return () => {
    const choices = {};
    for (const group of groups) {
      const selected = group.radios.find(radio => radio.checked);
      if (!selected) { group.radios[0].focus(); throw new Error('choose a drawing to keep for every overlapping date.'); }
      choices[group.id] = selected.value;
    }
    return choices;
  };
}
