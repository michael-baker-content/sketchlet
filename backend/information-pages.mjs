import { contactForm } from './contact-form.mjs';
import { infoHero } from './info-hero.mjs';
// Editorial drafts: update docs/PUBLIC-PAGES.md before removing the draft notice.
export const informationPages = new Map([
  ['info', {label:'info',draft:false,description:'Drawing guides, free draw, and updates from sketchlet.',content:`
    <p>A place to explore the tools, find answers, and catch up on sketchlet.</p>
    ${infoHero}
    <section id="practice"><h2>room to experiment</h2>
      <p>Try the tools on a canvas of your own. Free draw saves on this device and stays separate from the daily prompt. Download your experiments to keep a copy.</p>
      <p><a class="web-button site-button info-button" href="/free-draw">open free draw</a></p>
      <p>To start from one of your submitted images, open it in <a href="/gallery?view=mine">your gallery</a> and choose “free draw from this drawing.” The gallery original stays unchanged.</p>
    </section>
    <section id="drawing-guide"><h2>get to know the tools</h2>
      <dl class="tool-guide">
        <dt>brush &amp; marker</dt><dd>Start with brush for solid marks. Marker adds a translucent layer for softer color.</dd>
        <dt>pencil &amp; spray</dt><dd>Pencil builds a grainy texture with repeated strokes. Spray scatters small dots; build up coverage gradually.</dd>
        <dt>line</dt><dd>Press where the line should start, drag to its endpoint, and release. Lines use a solid stroke with the selected size and shape.</dd>
        <dt>fill</dt><dd>Tap a connected area to fill it with your selected color. Gaps in a boundary let the color through. Undo reverses the whole fill.</dd>
        <dt>dashed &amp; dotted</dt><dd>Draw a trail of separated marks. Try different sizes and shapes to change the rhythm.</dd>
        <dt>shape, size &amp; erase</dt><dd>Choose circle, square, or rough shapes and fine, mid, or bold sizes. Switch to erase to remove marks. For spray, shape controls the dots.</dd>
      </dl>
      <div class="content-notice"><strong>Drawing with your finger?</strong><p>Your mark appears a little above your finger so you can see it. The strip below the canvas lets you reach the bottom edge. Full-screen mode makes more room when your screen supports it.</p></div>
      <p>Undo and redo let you revisit changes during a session. Clearing the canvas can also be undone. Download saves a PNG; “save to gallery” publishes your daily drawing and is final.</p>
    </section>
    <section id="announcements" class="announcement-board" aria-labelledby="announcements-heading"><div class="announcement-board-header"><h2 id="announcements-heading" class="announcements-masthead"><span aria-hidden="true">✉</span> from Michael</h2><p>Site news &amp; notes from the creator of sketchlet.</p></div><div class="announcement-board-messages"><!-- announcements --></div></section>
    <section id="site-information"><h2>about the site</h2><p>Read <a href="/about">about sketchlet</a>, the <a href="/privacy">privacy draft</a>, and the <a href="/community">community &amp; terms draft</a>. Have a question or suggestion? <a href="/contact">Send Michael a note</a>.</p></section>`}],
  ['about', { label:'about', content:`
    <p>sketchlet is a little drawing every day, a personal project by Michael Baker. A small creative break, whether you make a quick doodle or spend time on the details.</p>
    <h2>one prompt, lots of interpretations</h2>
    <p>Everyone gets the same prompt. A new one arrives at midnight Eastern time. Draw with the brushes, line and fill tools, choose your colors, and use undo if you change your mind.</p>
    <div class="content-notice"><strong>Saving and submitting are different.</strong><p>Your unfinished drawing saves on this device for its original day. When you save to the gallery, your submission is final: <strong>one drawing per day</strong>, with no replacement after removal. Downloading an image is separate from submitting it.</p></div>
    <h2>a gallery we make together</h2>
    <p>Explore today's drawings and older prompts in the <a href="/gallery">gallery</a>. Enter a display name to rate other people's drawings from one to five stars. You can rate without drawing first.</p>
    <p>Share a drawing's link or make an image card. Link previews use the sketchlet paintbrush logo; image cards include the artwork you choose to share.</p>
    <h2>no account needed</h2>
    <p>sketchlet recognizes your browser using a guest cookie. Your display name applies to your earlier drawings from that guest identity too. Clearing browser data or switching devices can mean losing access to that identity and your local draft.</p>
    <p>Read our <a href="/privacy">privacy draft</a> and <a href="/community">community &amp; terms draft</a> for more details.</p>
    <h2>get in touch</h2>
    <p>Send a note through <a href="/contact">contact</a>. To flag a drawing, use its “report drawing” button.</p>` }],
  ['privacy', { label:'privacy', content:`
    <p>This draft describes how sketchlet handles information while you draw, submit, rate and report. It is being reviewed before publication as a final policy.</p>
    <h2>on your device</h2>
    <p>Unfinished drawings and drawing preferences are stored in your browser. Guest profile photos stay in local browser storage. If you save a photo to your signed-in account, it is uploaded to private storage and shown only to you across your signed-in devices. Account photos are not included in public drawings or galleries. Your display name is also remembered locally.</p>
    <p>A guest cookie lets the server recognize your browser and associate submissions and votes with it. The server stores a hashed identifier. This is a browser identity, not an email account, and it is not a promise of anonymity.</p>
    <h2>on the server and in public</h2>
    <p>Optional account sign-in uses Clerk for email verification and Google sign-in. Clerk processes the information needed to authenticate you. sketchlet stores an internal account identifier and its Clerk association, and uses the account to associate drawings, names, ratings, reports, and an optional private profile photo. Signing in does not automatically claim existing guest work or upload a browser photo: both require your action. When two drawings have the same date, you choose which one to keep. The unselected drawing is hidden and retained internally with its account association and merge reason. Unfinished drafts remain device-local.</p>
    <p>Submitted drawings, their prompt and date, display names, ratings, and guest associations are stored on the server. <strong>Drawings and display names are public</strong>, including on shareable drawing and creator-gallery pages. Other people can copy or share public content.</p>
    <p>Report categories and explanations are stored for moderation, together with the reporting guest's identifier. Moderation decisions and administrator activity are recorded. Report details and internal decision notes are not shown in the public gallery.</p>
    <h2>operating the site</h2>
    <p>sketchlet uses guest and hashed network identifiers to limit repeated requests and abuse. It uses Vercel for hosting and Neon for database and image storage. The site requests its font from Google Fonts. Those services receive information needed to handle requests, which can include network and browser information.</p>
    <p>Administrator sign-in uses GitHub. Visitors do not need a GitHub account to draw or rate.</p>
    <p>Announcements may include embedded YouTube videos. These players load from YouTube’s privacy-enhanced domain, which still connects your browser to YouTube. Playing a video is subject to <a href="https://policies.google.com/privacy">Google’s privacy policy</a>.</p>
    <h2>contact messages</h2>
    <p>The contact form uses Formspree to receive messages and deliver them to Michael Baker. Submitting sends your selected topic, message, optional reply email, and optional drawing link to Formspree. The service also processes request information for delivery and spam protection. Messages are not published in the gallery or saved to sketchlet's drawing database; copies may be retained in Formspree and the receiving email inbox. See <a href="https://formspree.io/legal/privacy-policy/">Formspree's privacy policy</a>.</p>
    <h2>storage and removal</h2>
    <div class="content-notice"><strong>Hidden does not mean deleted.</strong><p>Clearing browser storage removes local data but does not delete submitted drawings or server records. Hiding a drawing through moderation removes it from public viewing; it does not erase the stored drawing. Hidden drawings can be retained for review or restoration.</p></div>
    <p>Use <a href="/contact">contact</a> for privacy or deletion questions. Fixed retention periods are still being established. Do not put private information in your drawing, display name, or report explanation.</p>
    <h2>before this policy is final</h2>
    <p>The intended age audience, retention schedule, and applicable privacy choices still need review. This draft does not promise an automated deletion or account-recovery service.</p>` }],
  ['community', { label:'community & terms', content:`
    <p>sketchlet is a shared space for playful drawings. These draft rules explain the intended community standards and how submissions are handled.</p>
    <h2>keep it welcoming</h2>
    <p>Mild crude humor, playful cartoon anatomy, innuendo, and swearing are allowed. Do not submit graphic or exploitative sexual content, explicit sexual activity, sexualized depictions of minors, graphic violence, hate or discrimination, threats, harassment, spam, or someone else's private information. Context matters: humor is not an excuse to target or harass someone.</p>
    <p>These expectations apply to drawings, display names, and reports. Do not impersonate others or manipulate ratings. The public gallery is not presented as child-safe or suitable for all ages.</p>
    <h2>public submissions and reports</h2>
    <p>Drawings become public when submitted; they are not reviewed in advance. Community submissions do not represent sketchlet's views.</p>
    <p>Use “report drawing” to choose a concern and optionally explain it. Reports are reviewed by the site administrator. Reporting does not automatically remove a drawing, and review may take time.</p>
    <p>The administrator can hide unsuitable drawings or clear inappropriate display names. Removed drawings do not appear in public galleries. Removal does not allow a replacement submission for that day.</p>
    <h2>your artwork</h2>
    <p>Our intended approach is that you retain the rights you hold in your artwork. Submitting a drawing would give sketchlet permission to store, display, and deliver it through the site's gallery and sharing features, without transferring ownership. The precise permission terms are still under review.</p>
    <p>sketchlet does not claim exclusive rights or restrict your own reuse of rights you hold. This proposed permission does not authorize sketchlet to sell merchandise featuring your drawing; any future merchandise feature would need separate authorization.</p>
    <p><strong>Only submit content you have permission to share.</strong> A prompt mentioning a character, person, or place does not grant rights or imply an affiliation. The site's copyright notice does not claim ownership of users' artwork.</p>
    <h2>look after your copy</h2>
    <p>Submissions are final. Guest access depends on your browser's cookie, and local drafts depend on browser storage. Download drawings you want to keep: permanent storage, uninterrupted availability, and recovery after clearing browser data are not guaranteed.</p>
    <h2>questions and review</h2>
    <p>Use <a href="/contact">contact</a> for questions, copyright concerns, and privacy requests. sketchlet is independently maintained by Michael Baker; responses may take time. The intended age audience and final terms will be established before this draft becomes a published policy.</p>` }],
  ['contact', { label:'contact', draft:false, script:'/src/contact.js', content:contactForm() }],
]);

export function informationPage(path) {
  return informationPages.get(path.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, ''));
}
