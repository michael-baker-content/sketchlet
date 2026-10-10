const form = document.querySelector('.contact-form');
if (form) {
  const status = document.querySelector('#contact-status');
  const hosted = document.querySelector('#contact-hosted');
  let pending = false;
  hosted.addEventListener('click', () => {
    if (!pending && form.reportValidity()) HTMLFormElement.prototype.submit.call(form);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    const body = new FormData(form);
    const controls = [...form.elements];
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    hosted.hidden = true;
    status.textContent = 'sending…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(form.action, {
        method:'POST', body, headers:{ Accept:'application/json' },
        credentials:'omit', signal:controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        status.textContent = response.status === 429
          ? 'the contact service is busy or has reached its limit. please try again later. your message is still here.'
          : 'your message could not be confirmed. try again, or continue through Formspree if a spam check is needed. the hosted option uses Formspree’s confirmation page.';
        hosted.hidden = response.status === 429;
        return;
      }
      form.reset();
      form.hidden = true;
      document.querySelector('#contact-success').hidden = false;
      document.querySelector('#contact-success-heading').focus();
    } catch {
      // A lost response does not prove the message was not delivered. Never
      // automatically resend a POST or fall back to a second submission.
      status.textContent = 'we couldn’t confirm delivery. your message is still here; retrying may send it twice. please check your connection before trying again.';
    } finally {
      clearTimeout(timeout);
      pending = false;
      controls.forEach(control => { control.disabled = false; });
      form.removeAttribute('aria-busy');
    }
  });
}
