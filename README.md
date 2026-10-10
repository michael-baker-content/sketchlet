# sketchlet

a crying dog. a laughing kite. your interpretation.

Sketchlet is a daily drawing playground with a soft spot for the old web: purple panels, chunky buttons, handwritten type, and room for a very silly drawing. A quick doodle belongs here just as much as something you've spent an hour on.

[**draw today's prompt →**](https://sketchlet-blush.vercel.app/)

## a little drawing every day

Everyone gets the same action-and-noun prompt. It changes at **midnight Eastern time**, including daylight saving time.

Draw, erase, change your mind, and keep going. Your unfinished canvas saves automatically in this browser. Each day's draft stays attached to its own prompt, so yesterday's kite won't accidentally become today's flower.

Starting fresh? Today's page shows the prompt and a few instructions with a **begin drawing** button. Editor files prepare in the background while you read. An existing draft—including a background-only edit—opens straight into the workspace; a completed day opens your submitted drawing.

When you're ready:

- **save to gallery** publishes your drawing after a confirmation. You get one submission per day, and it's final once saved.
- **download** keeps a PNG on your device. It doesn't publish anything or use your daily submission.

Each published drawing has its own shareable link, where you can return to see its ratings. Links include the prompt name and a compact identifier; use **copy link** beside the rating button to share one. **Share card** creates a retro PNG focused on your drawing, with a creator-and-prompt caption, date, and vertical sketchlet branding. The rounded card uses solid borders and omits ratings and the URL. Preview it, copy the image, or download it when your browser does not support image copying. Cards are generated on your device and are not uploaded. Older UUID links still work. Drawing on consecutive days builds your participation streak.

## inside the pencil case

The canvas is square, with a 1200 × 1200 pixel export and support for mouse, touch, and pen input.

| pick | what's inside |
| --- | --- |
| color | 24 colors for both ink and background, from soft pastels to midnight, navy, and forest |
| size | fine, mid, and bold |
| shape | circle, square, and rough |
| drawing tools | brush, marker, pencil, spray, line, fill, dashed, dotted |
| second thoughts | eraser, undo, redo, and an undoable clear |

Shapes work across every brush style and the eraser. Marker strokes are translucent, pencil grain builds up as you draw over it, and spray scatters small shaped dots.

Choose **line** in drawing tools, drag to preview, and release to commit a solid line using your selected size and shape. **Fill** colors the connected area you tap; size and shape are disabled for fill. A small color tolerance includes softened edges, but gaps in pencil or spray boundaries remain openings. Each line or fill is one undo step. The draw/erase selector still switches to the regular eraser.

Drawing and erasing follow your input without an added animation delay. The drawing workspace suppresses text selection and the canvas's long-press menu to keep gestures focused on drawing. Undo remembers up to 60 edits during the current session. **Ctrl/Cmd+Z** undoes; **Ctrl/Cmd+Shift+Z** redoes.

Phones and tablets get compact dropdown tools. Full-screen mode puts the drawing workspace in charge: no page scrolling, no header, and no submission buttons in the way. Close it to return to the normal page with your canvas and history intact. Desktop works too.

When drawing with a finger, the hollow cursor targets 24 screen pixels above your touch so you can see your mark. The narrow strip below the canvas lets you reach its bottom edge; it isn't part of your saved image. Mouse and stylus input stay directly under the pointer. Contrasting cursor outlines help on light and dark backgrounds.

## take a look around

The [gallery](https://sketchlet-blush.vercel.app/gallery) groups drawings by prompt. Each prompt's preview shows its highest-rated drawing, or its newest submission if nobody has rated one yet.

You can rate drawings **before making your own**. Add a name to your profile, then give drawings 1–5 stars or skip. The queue mixes today's drawings, older prompts, under-rated entries, and favorites. Your own drawings stay out of the queue, and you can revise an earlier vote from a drawing's page.

Old prompts remain open for looking and rating; new submissions belong to today's prompt.

## your little corner

There is no login. Sketchlet remembers this browser using a guest cookie.

Your profile holds an optional display name and a newest-first collection of **your drawings**, with dates and ratings. Changing your name updates the attribution on earlier drawings too. Names aren't unique or verified; leaving yours blank displays “anonymous.” A name is required for rating.

You can also add a profile photo for your own interface. It is resized and saved locally in your browser, never uploaded or shown to other visitors.

A few things to keep in mind:

- Drafts and profile photos live on this device.
- Published drawings, names, and votes live on the server.
- Clearing cookies or switching browsers or domains creates a different guest identity. Typing the same name does not reconnect your old drawings.
- Old drafts stay separate, but there isn't an interface for reopening them yet.

## behind the doodles

Sketchlet uses **HTML, CSS, and JavaScript**, with the Canvas API doing the drawing. **Unkempt** from Google Fonts supplies the handwriting; beveled controls and lavender panels supply the nostalgia.

**Vercel** serves the site and its Node.js API. **Neon Postgres** stores prompts, drawings, guest profiles, and votes. PNGs live in a private **Neon Object Storage** bucket and are served through the API. **Sharp** validates and re-encodes submitted images.

The database enforces one drawing per guest per prompt and one editable vote per guest per drawing. Server-side checks block self-voting, and shared request limits help curb abuse. Without accounts, these are browser-based rules—not proof that each visitor is a different person.

Public page metadata is rendered server-side for social crawlers. All shared links advertise the pixel paintbrush logo, never submitted artwork or ratings. Home uses “sketchlet - a little drawing every day”; drawing link titles credit the creator, such as “Michael drew a singing kite on sketchlet,” regardless of who sends the link. Social descriptions stay short, and X cards request the compact summary format. Artwork sharing remains an explicit **share card** action, whose caption omits the site suffix because the card already includes branding. Messaging apps decide the final layout and may retain cached previews.

The main pieces are:

- `src/studio.js`, `src/model.js`, and `src/brushes.js`: canvas, tools, undo, and shared stroke-spacing rules.
- `src/draft-storage.js`: shared access to date-scoped IndexedDB drafts for home startup and the editor.
- `src/canvas-cache.js` and `src/pointer-input.js`: reuse rendered strokes and map batched pointer samples to canvas coordinates.
- `backend/page-shell.mjs`: shared HTML template for the separate home, gallery, and admin pages, generated during the build and rendered directly by the page server.
- `src/home-page.js`: today's page; submission status is checked before loading an editor.
- `src/gallery-page.js`: gallery and shared-drawing pages, independent of the editor and today's status request.
- `src/editor.html` and `src/submission.js`: drawing markup and submission controls, loaded only for an unfinished day.
- `src/gallery.js`: shared profile and community views, with page initialization explicitly called by each entry point.
- `src/api-client.js` and `src/page-startup.js`: API requests and conditional home startup.
- `src/text-format.js`: singular/plural count labels and creator captions shared by gallery text, share cards, and link metadata.
- `backend/social.mjs`, `backend/social-data.mjs`, and `api/pages.js`: crawler-friendly page metadata and generated social preview images.
- `backend/admin-auth.mjs`, `backend/admin-store.mjs`, and `src/admin-moderation.js`: administrator sign-in, submission/report review, hide/restore, name clearing, and private audit history. See [admin setup](docs/ADMIN.md).
- `backend/gallery-handler.mjs`: public API behavior with injectable database/storage dependencies for tests; `backend/api.mjs` connects the real services. `backend/storage.mjs` shares image delivery between public visibility checks and authenticated admin review.
- `src/report-dialog.js` and `src/moderation-options.js`: visitor reporting and shared report/removal categories.
- `src/styles/`: base styles, playful details, retro surfaces, page layouts, and loading styles, loaded in that order. Dropdown surfaces and cursors are shared across drawing layouts.
- `backend/` and `db/`: local server, API, validation, storage access, and database migrations.
- `api/`, `scripts/`, and `vercel.json`: hosting, social-preview rendering, local development, and the public-file build.
- `docs/`: design notes and deployment instructions.

## still on the sketchpad

Daily prompts now follow a [26-week curated calendar](docs/PROMPTS.md), mixing simple visual twists, familiar named subjects, and occasional pairs or trios. Existing prompt galleries retain their original titles.

Sketchlet is an early version. Accounts and cross-device history, community-suggested prompts, and old-draft recovery are future work.

The `/admin` page supports owner-only GitHub sign-in, submission and report review, reversible drawing removal, display-name clearing, and an activity log. Visitors can report drawings without logging in. Hidden drawings remain that day's submission and cannot be replaced. Guest restrictions, prompt management, and email alerts are still planned.

Public gallery browsing currently covers up to 90 prompt dates and 200 drawings per prompt. Your profile's drawing list loads in pages of 24.

## keeping the pencils sharp

The shared footer links to About, Privacy, and Community & Terms. These are visibly marked drafts, readable without JavaScript, and excluded from search indexing. Review the [public-page publication checklist](docs/PUBLIC-PAGES.md) before treating them as final policies. Deploying the current build makes the drafts publicly accessible.

The footer also links to a standalone Contact page connected to Formspree. Successful submissions show an inline thank-you message and a return-home link; errors preserve the message. A hosted fallback supports spam challenges and visitors without JavaScript. See [contact setup and delivery checks](docs/CONTACT.md). It requires no new dependency or database table.

Maintenance uses Node.js 22.20 or newer. Local credentials belong in `.env.local`; `.env.example` lists the required settings.

| command | purpose |
| --- | --- |
| `npm ci` | install the locked dependencies |
| `npm run dev` | start the local site at localhost:5173 |
| `npm run check` | check JavaScript syntax and run tests |
| `npm run test:browser` | check page flows, tool synchronization, and drawing regression cases in desktop and phone Chromium |
| `npm run build` | assemble the public files in `dist/` |
| `npm run db:migrate` | apply database migrations when needed |

Stop the existing local server before restarting after backend changes. Run checks and a build before pushing; Vercel builds from source and does not run migrations. Credentials and generated build output stay out of Git.

The browser checks in `checks/browser/` serve the real page assets through Playwright and replace API responses with fixtures. They need no running server or database, and cannot submit drawings or votes to Neon. Playwright is included in the locked dependencies; after `npm ci`, install its browser once with `npx playwright install chromium`. Browser tests run in desktop and phone configurations, so names appear twice. Touch-only cases are intentionally skipped in the desktop configuration.

Drawing checks compare incremental pencil rendering against full replay pixel-for-pixel and verify reduced grain operations, pointer batching, and tool state across layouts. These guard correctness and repeated work; they do not measure real-phone responsiveness. See the [drawing release checks](docs/DEPLOYMENT.md#drawing-performance-release-checks) before assessing performance on a device.

[Deployment and release checks](docs/DEPLOYMENT.md) · [Admin setup](docs/ADMIN.md) · [Design direction](docs/DESIGN.md)
