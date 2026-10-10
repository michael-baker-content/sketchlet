import test from 'node:test';
import assert from 'node:assert/strict';
import { contactForm } from '../backend/contact-form.mjs';
import { renderPageShell } from '../backend/page-shell.mjs';
import { publicFile } from '../backend/public-files.mjs';

test('contact form accepts only Formspree endpoints and fails closed before configuration', () => {
  for (const endpoint of ['', 'https://example.com/f/test', 'https://formspree.io/f/a" onclick="bad', 'http://formspree.io/f/test']) {
    assert.doesNotMatch(contactForm(endpoint), /<form/);
    assert.match(contactForm(endpoint), /being connected/);
  }
  const html = contactForm('https://formspree.io/f/testform');
  assert.match(html, /action="https:\/\/formspree.io\/f\/testform" method="post"/);
  assert.match(html, /name="message"[^>]*required[^>]*maxlength="5000"/);
  assert.match(html, /name="email" type="email"/);
  assert.match(html, /name="_gotcha"/);
  assert.doesNotMatch(html, /<script|type="file"|mailto:|sketchlet_guest/);
});

test('contact is a standalone page with a footer link and no editor or loading script', () => {
  assert.equal(publicFile('/contact'), 'contact.html');
  assert.equal(publicFile('/contact/'), 'contact.html');
  const html = renderPageShell('contact.html');
  assert.match(html, /href="\/contact" aria-current="page"/);
  assert.match(html, /action="https:\/\/formspree.io\/f\/xkjobjqb"/);
  assert.match(html, /src="\/src\/contact.js"/);
  assert.doesNotMatch(html, /src="\/src\/loading.js"|<canvas|draft for review/);
});
