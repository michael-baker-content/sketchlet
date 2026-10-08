// Plain text only: HTML callers still escape values at the rendering boundary.
export function counted(value, singular, plural = `${singular}s`) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

export function drawingCaption(name, prompt) {
  return `${name || 'someone'} drew a ${prompt}`;
}
