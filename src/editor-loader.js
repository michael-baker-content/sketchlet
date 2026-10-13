let editorTemplate;
export function prepareEditor() {
  if (!editorTemplate) editorTemplate = fetch('/src/editor.html').then(async response => {
    if (!response.ok) throw new Error('could not load drawing tools. please try again.');
    return response.text();
  }).catch(error => { editorTemplate = null; throw error; });
  return editorTemplate;
}
export async function loadEditor() {
  const template = document.createElement('template');
  template.innerHTML = await prepareEditor();
  document.querySelector('#page-content').before(template.content);
  return import('./studio.js');
}
