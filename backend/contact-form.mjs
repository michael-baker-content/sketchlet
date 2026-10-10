// Public form endpoint, not an API key. Configuration notes: docs/CONTACT.md.
export const CONTACT_ENDPOINT = 'https://formspree.io/f/xkjobjqb';

export function contactForm(endpoint = CONTACT_ENDPOINT) {
  if (!/^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(endpoint)) {
    return '<p>the contact form is being connected. please check back soon. to flag a drawing, use its “report drawing” button.</p>';
  }
  // The local contact module enhances this native POST with inline confirmation.
  // Native submission remains available for no-JavaScript and hosted challenges.
  return `<p>have a question, spotted a problem, or want to share an idea? send Michael a note.</p>
    <form class="contact-form" action="${endpoint}" method="post" aria-describedby="contact-privacy">
      <label for="contact-topic">topic</label>
      <select id="contact-topic" name="topic" required>
        <option value="feedback">general feedback</option>
        <option value="technical">technical issue</option>
        <option value="privacy">privacy or deletion request</option>
        <option value="copyright">copyright concern</option>
        <option value="other">other question</option>
      </select>
      <label for="contact-email">reply email (optional)</label>
      <input id="contact-email" name="email" type="email" autocomplete="email" maxlength="254" aria-describedby="contact-email-help">
      <small id="contact-email-help">include an email address if you'd like a response.</small>
      <label for="contact-drawing">drawing link (optional)</label>
      <input id="contact-drawing" name="drawing_url" type="url" inputmode="url" maxlength="500" placeholder="https://…">
      <label for="contact-message">message</label>
      <textarea id="contact-message" name="message" rows="7" required maxlength="5000" aria-describedby="contact-message-help"></textarea>
      <small id="contact-message-help">up to 5,000 characters. please leave out sensitive personal information.</small>
      <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" class="contact-honeypot" aria-hidden="true">
      <input type="hidden" name="_subject" value="sketchlet contact message">
      <p id="contact-privacy">messages are delivered to Michael through Formspree. see our <a href="/privacy">privacy page</a> for details.</p>
      <button class="web-button" type="submit">send message</button>
      <p id="contact-status" role="status" aria-live="polite"></p>
      <button id="contact-hosted" class="web-button" type="button" hidden>continue through Formspree</button>
      <noscript><p>sending opens Formspree's confirmation page and may include a spam check.</p></noscript>
    </form>
    <section id="contact-success" hidden aria-labelledby="contact-success-heading">
      <h2 id="contact-success-heading" tabindex="-1">thanks for your message!</h2>
      <p>your message has been sent.</p>
      <a class="web-button" href="/">return to sketchlet</a>
    </section>`;
}
