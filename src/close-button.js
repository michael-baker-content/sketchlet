// Shared by dialog close controls; the button retains its accessible label.
export function setCloseIcon(button) {
  button.classList.add('close-button');
  button.type = 'button';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 5 14 14M19 5 5 19"/></svg>';
}
