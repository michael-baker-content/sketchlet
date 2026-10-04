# sketchlet

a crying dog. a laughing kite. your interpretation.

Sketchlet is a daily drawing playground with a soft spot for the old web: purple panels, chunky buttons, handwritten type, and room for a very silly drawing. A quick doodle belongs here just as much as something you've spent an hour on.

[**draw today's prompt →**](https://sketchlet-blush.vercel.app/)

## a little drawing every day

Everyone gets the same action-and-noun prompt. It changes at **midnight Eastern time**, including daylight saving time.

Draw, erase, change your mind, and keep going. Your unfinished canvas saves automatically in this browser. Each day's draft stays attached to its own prompt, so yesterday's kite won't accidentally become today's flower.

When you're ready:

- **save to gallery** publishes your drawing after a confirmation. You get one submission per day, and it's final once saved.
- **download** keeps a PNG on your device. It doesn't publish anything or use your daily submission.

Each published drawing has its own shareable link, where you can return to see its ratings. Drawing on consecutive days builds your participation streak.

## inside the pencil case

The canvas is square, with a 1200 × 1200 pixel export and support for mouse, touch, and pen input.

| pick | what's inside |
| --- | --- |
| color | 24 colors for both ink and background, from soft pastels to midnight, navy, and forest |
| size | fine, mid, and bold |
| shape | circle, square, and rough |
| style | brush, dashed, dotted, marker, spray, and pencil |
| second thoughts | eraser, undo, redo, and an undoable clear |

Shapes work across every brush style and the eraser. Marker strokes are translucent, pencil grain builds up as you draw over it, and spray scatters small shaped dots.

Strokes have a slight trailing animation, with reduced-motion preferences respected. Undo remembers up to 60 edits during the current session. **Ctrl/Cmd+Z** undoes; **Ctrl/Cmd+Shift+Z** redoes.

Phones and tablets get compact dropdown tools. Full-screen mode puts the drawing workspace in charge: no page scrolling, no header, and no submission buttons in the way. Close it to return to the normal page with your canvas and history intact. Desktop works too.

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

The main pieces are:

- `src/studio.js`, `src/model.js`, and `src/brushes.js`: canvas, tools, undo, and draft storage.
- `src/gallery.js`: daily prompts, submissions, profiles, galleries, and rating screens.
- `backend/` and `db/`: API, validation, storage access, and database migrations.
- `api/`, `scripts/`, and `vercel.json`: hosting, local development, and the public-file build.

## still on the sketchpad

Sketchlet is an early version. Accounts and cross-device history, community-suggested prompts, old-draft recovery, and moderation/reporting are future work.

Public gallery browsing currently covers up to 90 prompt dates and 200 drawings per prompt. Your profile's drawing list loads in pages of 24.

## keeping the pencils sharp

Maintenance uses Node.js 22.20 or newer. Local credentials belong in `.env.local`; `.env.example` lists the required settings.

| command | purpose |
| --- | --- |
| `npm ci` | install the locked dependencies |
| `npm run dev` | start the local site at localhost:5173 |
| `npm run check` | check JavaScript syntax and run tests |
| `npm run build` | assemble the public files in `dist/` |
| `npm run db:migrate` | apply database migrations when needed |

Stop the existing local server before restarting after backend changes. Run checks and a build before pushing; Vercel builds from source and does not run migrations. Credentials and generated build output stay out of Git.

[Deployment and release checks](DEPLOYMENT.md) · [Design direction](DESIGN.md)
