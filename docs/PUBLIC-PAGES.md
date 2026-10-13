# Public information pages: publication checklist

The `/about`, `/privacy`, and `/community` pages are editorial drafts, not finalized legal policies. They are linked from the shared footer, rendered on the server and at build time, and readable without JavaScript or database access. Draft pages carry a visible notice and `noindex, nofollow`; noindex does not make them private. Pushing this build publishes the drafts at their URLs.

Content lives in `backend/information-pages.mjs`; the shared shell and footer live in `backend/page-shell.mjs`. These files contain fixed editorial HTML only, never visitor-supplied HTML.

## Reading styles

`src/styles/content.css` defines the reading layer: IBM Plex Sans for policies, procedures, form help, and moderation explanations; IBM Plex Mono for code and technical identifiers. Both load from Google Fonts with swap behavior and local fallbacks. Unkempt remains on headings, profile names, navigation, buttons, drawing controls, and short status messages. Explanatory prose uses sentence case, preserving lowercase `sketchlet`; controls and short statuses remain lowercase. A live region containing guidance uses `.reading-copy` to retain the reading font; `role="status"` alone does not determine its visual style. Capitalization is authored in the source, never applied to user text by script.

Use numbered `.procedure-steps` for sequences, `<strong>` for key conditions, and `.content-notice` for important context. Notices use square lavender surfaces and classic beveled borders. `.content-notice--important` adds a quiet double-line heading divider for irreversible consequences, rather than a warning-colored stripe. Use `.terminal-output` for actionable lookup explanations: an inset dark plum panel with light IBM Plex Mono text. The empty guest-drawing result uses this treatment; loading, successful reviews, and completion messages do not retain it. Keep notices selective, preserve policy meanings, and do not turn draft language into promises or finalized terms. Shared linking notice markup lives in `src/merge-review.js` so local linking and transfers stay consistent.

## Michael's decisions before public launch of the policies

1. Formspree is connected and initial local delivery was verified. Complete the inline-confirmation and production checks in [CONTACT.md](CONTACT.md). No public appeals promise is planned; restoration remains an internal capability. The report button remains the route for flagging drawings.
2. Michael Baker is the confirmed operator and Sketchlet is a personal project. Location/jurisdiction, intended countries served, and the final age policy remain unresolved. The gallery permits mild crude humor and is not described as child-safe. Ask qualified legal counsel which privacy, children's privacy, and user-content obligations apply; an age sentence alone is not a compliance solution.
3. Choose realistic retention periods for drawings, hidden content, votes, reports, hashed identifiers, audit records, backups, and provider logs. Implement any deletion process promised before adding deadlines to the privacy page. Current moderation hides content rather than deleting it.
4. Check actual production services and settings: Vercel, Neon, Formspree and its receiving mailbox, Google Fonts, GitHub admin auth, logs, backups, analytics or integrations enabled outside the repository. Confirm their data handling before finalizing disclosures; do not promise no tracking or no sharing without verifying it.
5. Finalize the artwork permission: creators keep their rights, while Sketchlet needs permission to host and display submissions and support sharing. Confirm scope, duration, removal behavior, prohibited content, and dispute handling with legal review. The draft does not assert that a new license has already been accepted.
6. Decide how visitors will receive and accept material terms before submission, and how later changes will be communicated. Footer links alone are not an implemented acceptance workflow.

Owner-controlled hiding for future logged-in users is planned, not currently offered. A provisional 90-day retention target for moderated content still needs implementation and review; it is not promised publicly. Creators retain rights they hold. Future merchandise would require separate authorization, not exclusive site ownership.

## Finishing the implementation

- Replace unresolved paragraphs with approved, accurate text and working contact links; use a real effective/updated date.
- Remove draft notices and draft-specific robots restrictions only after approval. These are currently in `backend/page-shell.mjs` and `backend/social.mjs`; update the draft social description too.
- Keep site copyright separate from ownership of user artwork. Update the year/range when appropriate.
- Verify each page at 320px, with keyboard navigation, with JavaScript disabled, and by directly loading/reloading its URL on Vercel. Check every footer link on home, gallery, drawing, and admin pages.
- Run `npm run check`, `npm run test:browser`, and `npm run build`. No database migration or new dependency is needed.

The universal footer now contains information links and copyright. Daily drawing rules remain in the home introduction and About page rather than being repeated under unrelated galleries.
