export function announcementInput(input) {
  if (!input || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.id || '') || !Number.isSafeInteger(input.version) || input.version < 0) throw new Error('invalid announcement revision');
  if (!['draft','published','scheduled'].includes(input.status)) throw new Error('choose draft, published, or scheduled');
  const publishAt = input.status === 'scheduled' ? input.publishAt : null;
  if (input.status === 'scheduled' && (typeof publishAt !== 'string' || !Number.isFinite(Date.parse(publishAt)) || Date.parse(publishAt)<=Date.now())) throw new Error('choose a future publishing time');
  if (typeof input.title !== 'string' || typeof input.body !== 'string') throw new Error('a title and message are required');
  const title = input.title.trim(), body = input.body.replace(/\r\n?/g,'\n').trim();
  const description = input.description === undefined ? '' : input.description;
  if (typeof description !== 'string' || description.trim().length>240 || /[\x00-\x1f\x7f]/.test(description)) throw new Error('use a short description of up to 240 characters without line breaks');
  if (!title || title.length>120 || /[\r\n\x00-\x1f]/.test(title)) throw new Error('use a title of 1–120 characters');
  if (!body || body.length>10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body)) throw new Error('use a message of 1–10,000 characters');
  return {id:input.id,version:input.version,status:input.status,title,body,description:description.trim(),publishAt:publishAt ? new Date(publishAt).toISOString() : null};
}
