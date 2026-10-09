// Plain text only: HTML callers still escape values at the rendering boundary.
export function counted(value, singular, plural = `${singular}s`) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

export function drawingCaption(name, prompt) {
  const completePhrase = /^(?:a|an|the|two|three)\b/i.test(prompt) || /^[A-Z]/.test(prompt);
  return `${name || 'someone'} drew ${completePhrase ? '' : 'a '}${prompt}`;
}
