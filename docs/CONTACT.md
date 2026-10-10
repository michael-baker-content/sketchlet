# Contact form

`/contact` sends directly to Formspree. A small local script requests a JSON response and, after confirmed success, displays a Sketchlet thank-you message with a “return to sketchlet” home link. It adds no client library and sends no guest identifier or draft data. Sketchlet does not save a copy to Neon or expose a recipient email address.

Without JavaScript, the standard HTML POST still works using Formspree's hosted confirmation. If an AJAX submission is rejected, a manual hosted-submit option is available for spam challenges; that fallback also uses Formspree's confirmation and original back link. Keep spam protection enabled. A fully custom challenge would require separate provider configuration if hosted fallback is frequently needed.

## Setup

The Sketchlet endpoint is configured, and initial hosted delivery was verified locally. Recheck the newer inline confirmation flow and production delivery before considering the release verified. The steps below are also the reference for changing the form later.

1. Create a **Dashboard project** named Sketchlet and a Contact form in Formspree. Select and verify the receiving email address.
2. Put the public `https://formspree.io/f/…` endpoint in `CONTACT_ENDPOINT` in `backend/contact-form.mjs`. This is not a secret; do not add an API key. Without a valid endpoint the page displays an unavailable message and cannot submit.
3. Keep Formspree spam protection enabled. The form includes its `_gotcha` honeypot. If enabling domain restrictions, include the actual production domain and account for localhost testing. Inspect notification and retention settings for your plan.
4. Restart the local server after backend edits, run the checks and build, then deploy. No dependencies, environment variables, or migration are needed.
5. Manually send a clearly labeled test message. Confirm receipt in both Formspree and the notification inbox, the reply address behavior, the inline confirmation, and the “return to sketchlet” link on a phone. Test hosted fallback separately if a spam challenge is needed. Automated tests must never send real messages.

## Fields and handling

Topic and message are required. Email and drawing link are optional; no reply can be sent without a reply address. The message is limited to 5,000 characters in the browser. Browser validation is a usability feature, not a server-enforced abuse limit; configure protection in Formspree too.

The normal JavaScript flow keeps users on Sketchlet, disables controls during submission, and retains their text on errors. A 20-second timeout or network failure cannot prove non-delivery, so the page warns that retrying may duplicate a message; it never retries automatically. Check the dashboard and quota regularly. Replying from a personal mailbox reveals its address to the recipient.

Retention covers both Formspree and email inbox copies. Decide a retention practice before stating a fixed period in the privacy policy. Do not enable automatic echoes of arbitrary submitted messages to unverified email addresses.

## Files and automated checks

- `backend/contact-form.mjs`: public endpoint and accessible HTML fields.
- `src/contact.js`: submission state, confirmation, timeout, and hosted fallback; loaded only on Contact.
- `backend/information-pages.mjs`: page registration and privacy disclosure.
- `tests/contact.test.mjs`: endpoint validation and standalone shell checks.
- `checks/browser/pages.spec.js`: mocked successful submission/return home and error/retry flows in both browser configurations. These checks do not verify live Formspree delivery or its challenge settings.

References: [dashboard projects](https://help.formspree.io/articles/form-and-project-settings/getting-started-with-projects), [honeypot](https://help.formspree.io/articles/building-your-form/honeypot-spam-filtering/).
