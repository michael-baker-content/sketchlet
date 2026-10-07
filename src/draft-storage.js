import { draftKey, validDocument, createDocument } from './model.js';

let opening;
export function openDraftDatabase() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open('little-canvas', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('draft storage is blocked'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}
export function readDraft(db, day) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(draftKey(day));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function hasDrawingDraft(record, day) {
  return !!(record?.day === day && validDocument(record.document) &&
    (record.document.strokes.length || record.document.background !== createDocument().background));
}
