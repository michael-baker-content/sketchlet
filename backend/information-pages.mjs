import { contactForm } from './contact-form.mjs';
// Editorial drafts: update docs/PUBLIC-PAGES.md before removing the draft notice.
export const informationPages = new Map([
  ['about', { label:'about', content:`
    <p>sketchlet is a little drawing every day, a personal project by Michael Baker. a small creative break, whether you make a quick doodle or spend time on the details.</p>
    <h2>one prompt, lots of interpretations</h2>
    <p>everyone gets the same prompt. a new one arrives at midnight eastern time. draw with the brushes, line and fill tools, choose your colors, and use undo if you change your mind.</p>
    <p>your unfinished drawing saves on this device for its original day. when you save to the gallery, your submission is final: one drawing per day, with no replacement after removal. downloading an image is separate from submitting it.</p>
    <h2>a gallery we make together</h2>
    <p>explore today's drawings and older prompts in the <a href="/gallery">gallery</a>. enter a display name to rate other people's drawings from one to five stars. you can rate without drawing first.</p>
    <p>share a drawing's link or make an image card. link previews use the sketchlet paintbrush logo; image cards include the artwork you choose to share.</p>
    <h2>no account needed</h2>
    <p>sketchlet recognizes your browser using a guest cookie. your display name applies to your earlier drawings from that guest identity too. clearing browser data or switching devices can mean losing access to that identity and your local draft.</p>
    <p>read our <a href="/privacy">privacy draft</a> and <a href="/community">community &amp; terms draft</a> for more details.</p>
    <h2>get in touch</h2>
    <p>send a note through <a href="/contact">contact</a>. to flag a drawing, use its “report drawing” button.</p>` }],
  ['privacy', { label:'privacy', content:`
    <p>this draft describes how sketchlet handles information while you draw, submit, rate and report. it is being reviewed before publication as a final policy.</p>
    <h2>on your device</h2>
    <p>unfinished drawings and drawing preferences are stored in your browser. your optional profile photo stays in local browser storage; sketchlet does not upload it as a public avatar. your display name is also remembered locally.</p>
    <p>a guest cookie lets the server recognize your browser and associate submissions and votes with it. the server stores a hashed identifier. this is a browser identity, not an email account, and it is not a promise of anonymity.</p>
    <h2>on the server and in public</h2>
    <p>submitted drawings, their prompt and date, display names, ratings, and guest associations are stored on the server. drawings and display names are public, including on shareable drawing and creator-gallery pages. other people can copy or share public content.</p>
    <p>report categories and explanations are stored for moderation, together with the reporting guest's identifier. moderation decisions and administrator activity are recorded. report details and internal decision notes are not shown in the public gallery.</p>
    <h2>operating the site</h2>
    <p>sketchlet uses guest and hashed network identifiers to limit repeated requests and abuse. it uses Vercel for hosting and Neon for database and image storage. the site requests its font from Google Fonts. those services receive information needed to handle requests, which can include network and browser information.</p>
    <p>administrator sign-in uses GitHub. visitors do not need a GitHub account to draw or rate.</p>
    <h2>contact messages</h2>
    <p>the contact form uses Formspree to receive messages and deliver them to Michael Baker. submitting sends your selected topic, message, optional reply email, and optional drawing link to Formspree. the service also processes request information for delivery and spam protection. messages are not published in the gallery or saved to sketchlet's drawing database; copies may be retained in Formspree and the receiving email inbox. see <a href="https://formspree.io/legal/privacy-policy/">Formspree's privacy policy</a>.</p>
    <h2>storage and removal</h2>
    <p>clearing browser storage removes local data but does not delete submitted drawings or server records. hiding a drawing through moderation removes it from public viewing; it does not erase the stored drawing. hidden drawings can be retained for review or restoration.</p>
    <p>use <a href="/contact">contact</a> for privacy or deletion questions. fixed retention periods are still being established. do not put private information in your drawing, display name, or report explanation.</p>
    <h2>before this policy is final</h2>
    <p>the intended age audience, retention schedule, and applicable privacy choices still need review. this draft does not promise an automated deletion or account-recovery service.</p>` }],
  ['community', { label:'community & terms', content:`
    <p>sketchlet is a shared space for playful drawings. these draft rules explain the intended community standards and how submissions are handled.</p>
    <h2>keep it welcoming</h2>
    <p>mild crude humor, playful cartoon anatomy, innuendo, and swearing are allowed. do not submit graphic or exploitative sexual content, explicit sexual activity, sexualized depictions of minors, graphic violence, hate or discrimination, threats, harassment, spam, or someone else's private information. context matters: humor is not an excuse to target or harass someone.</p>
    <p>these expectations apply to drawings, display names, and reports. do not impersonate others or manipulate ratings. the public gallery is not presented as child-safe or suitable for all ages.</p>
    <h2>public submissions and reports</h2>
    <p>drawings become public when submitted; they are not reviewed in advance. community submissions do not represent sketchlet's views.</p>
    <p>use “report drawing” to choose a concern and optionally explain it. reports are reviewed by the site administrator. reporting does not automatically remove a drawing, and review may take time.</p>
    <p>the administrator can hide unsuitable drawings or clear inappropriate display names. removed drawings do not appear in public galleries. removal does not allow a replacement submission for that day.</p>
    <h2>your artwork</h2>
    <p>our intended approach is that you retain the rights you hold in your artwork. submitting a drawing would give sketchlet permission to store, display, and deliver it through the site's gallery and sharing features, without transferring ownership. the precise permission terms are still under review.</p>
    <p>sketchlet does not claim exclusive rights or restrict your own reuse of rights you hold. this proposed permission does not authorize sketchlet to sell merchandise featuring your drawing; any future merchandise feature would need separate authorization.</p>
    <p>only submit content you have permission to share. a prompt mentioning a character, person, or place does not grant rights or imply an affiliation. the site's copyright notice does not claim ownership of users' artwork.</p>
    <h2>look after your copy</h2>
    <p>submissions are final. guest access depends on your browser's cookie, and local drafts depend on browser storage. download drawings you want to keep: permanent storage, uninterrupted availability, and recovery after clearing browser data are not guaranteed.</p>
    <h2>questions and review</h2>
    <p>use <a href="/contact">contact</a> for questions, copyright concerns, and privacy requests. sketchlet is independently maintained by Michael Baker; responses may take time. the intended age audience and final terms will be established before this draft becomes a published policy.</p>` }],
  ['contact', { label:'contact', draft:false, script:'/src/contact.js', content:contactForm() }],
]);

export function informationPage(path) {
  return informationPages.get(path.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, ''));
}
