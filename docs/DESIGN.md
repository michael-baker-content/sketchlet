# Site direction

The site name is Sketchlet, displayed as "sketchlet". Existing browser storage keys retain their original names to preserve drafts and saved preview data.

## Global presentation

Use the drawing studio's current retro-web treatment throughout the application. [src/styles/retro.css](../src/styles/retro.css) is the current visual reference.

- Unkempt from Google Fonts, with bold weight for the sketchlet header; lowercase visible copy.
- Raised beveled buttons, inset fields and canvas, square corners, hard shadows.
- Purple title bars and accents, muted gray-lavender panels, subtle tiled page background.
- Selected controls appear pressed in. Keyboard focus remains clearly visible.
- Concise functional labels; avoid decorative slogans, mascots, and filler copy.
- Preserve large touch targets and responsive phone, tablet, and desktop layouts.

## Agreed product behavior

- One shared daily action-and-noun prompt (for example, "crying dog" or "laughing kite"), changing at midnight America/New_York. Pairings are deterministic for the date and can be playful or impossible.
- One final submission per browser identity per prompt; editing and local draft saving before submission.
- No user-facing login for the MVP. Accounts are a later feature.
- Unique public URL for each submitted drawing, with its average rating and vote count.
- After submission, show the drawing, ratings, participation streak, and an option to rate more drawings.
- Rate drawings individually with 1–5 stars or skip. Mix under-rated drawings with well-rated drawings; exclude the visitor's own submission.
- Archive prompts allow rating but not new drawings in the MVP.
- Participation streaks are based on consecutive Eastern prompt dates.
- Neon Postgres and a private drawings bucket store submitted drawings and ratings. Drafts remain on the current device.
- Vercel is the selected web/API host. Deployment preparation and validation steps are in DEPLOYMENT.md; the user runs terminal commands and initiates deployment.
- Rating requires a saved profile name, but does not require submitting a drawing. Shared links support rating and editing a previous vote; users cannot rate their own drawings.

## Current interface

1. Daily prompt and date surrounding the existing drawing studio.
2. Submission review explaining that submitting is final.
3. Submitted drawing view with sharing, ratings, and streak.
4. One-at-a-time rating view with star selection and skip.
5. Empty states for a new community and an exhausted rating queue.
6. Archive browsing and individual drawing pages.
7. Editable profile with a local-only photo and a paginated list of this browser's drawings.
8. Full-screen drawing on portrait phones and tablets; landscape requires at least 1101px width. Rotating into narrower landscape returns to normal view with the drawing and undo history preserved. Narrow screens use two tool columns, with swatches in color menus.
9. Separate gallery submission and PNG download buttons above a contrasting rules footer in normal view.

The home and gallery have separate document and JavaScript entry points. Home requests submission status before loading editor markup, code, or draft storage. Gallery and shared-drawing pages request their own data without initializing the editor or requesting today's status. Submission controls are loaded only alongside the editor. Shared community/profile rendering remains in `src/gallery.js`; further component extraction is separate work.

Gallery submission is the primary action and PNG download is an optional local export. Keep previous local drafts and preview records intact. No sample votes or drawings are migrated automatically. Follow [README](../README.md) and [DEPLOYMENT.md](DEPLOYMENT.md) for setup and release verification.

## Drawing performance and deferred statistics

Drawing performance: completed strokes are cached. Live seeded pencil strokes append only new distance-spaced grain to the existing working buffer; other styles retain their single-fill rendering to preserve opacity and edges. Cache invalidation rebuilds from stroke data after context recovery or a history change. No additional canvas or persisted draft format is needed. Browser checks compare incremental pencil pixels against full replay and count grain operations; real-phone responsiveness still requires manual validation.

Deferred, lowest-priority idea: collect lightweight creation statistics (palette, strokes, undos, brush usage by distance, active drawing time) for a restrained share-card visualization. Count user actions independently of rendering and save summaries alongside drafts. Do not implement tracking or display statistics yet; drawing performance takes priority.

Pointer input and cursor positioning share one fresh canvas measurement per event, including coalesced samples. Measurements are not cached between events, so scrolling, resizing and full-screen transitions use current coordinates. Ending a gesture cancels its queued preview before painting the committed result.

Tool selection is shared editor state. Desktop palettes and compact/full-screen controls call the same selection functions and refresh directly from that state. Background changes remain document edits, so undo, redo and draft restoration refresh both sets of controls. Tool synchronization does not use mutation observers or simulated clicks; observers for page information and layout remain separate.

Next: validate layered pencil shading, long regular-brush strokes, and erasing on the affected phone. Establish repeatable frame-time benchmarks before choosing further rendering changes. Keep canvas resolution, undo depth, and stroke length unchanged unless measurements justify limits.

## Line and fill

Dropdown order: brush, marker, pencil, spray, line, fill, dashed, dotted. New pencil strokes use `pencilVersion: 2`, with grain opacity multiplied by 1.35 (approximately 16–46%). New spray strokes use `sprayVersion: 5`: four shaped dots per distance sample at 40% opacity. Dot size and spacing are unchanged. Spray deposits while moving, not continuously while stationary. Versioned rendering preserves older strokes during undo, reload, and replay; no database migration is needed.

The drawing-tools dropdown includes brush styles, line, and fill. Lines preview between two endpoints and commit on release; pointer cancellation discards an unfinished line. Fill uses four-connected visible pixels with a fixed per-channel tolerance of 24, then stores sorted horizontal runs in the document. Replay paints these runs directly, so subsequent background changes cannot alter the filled region. Flood-fill pixel buffers are temporary and used only on a fill action. Pattern fills are deferred. Existing drafts remain valid; new fill actions require this version of the editor to restore.

## Page loading

Home checks the server submission first, then reads today's local draft through `src/draft-storage.js`, independently of editor startup. A valid nonempty or background-only draft opens the workspace directly. Otherwise, the shared home controller shows concise instructions and a begin button. The editor template and module are preloaded without mounting or evaluating the editor. Begin rechecks the server date/submission before mounting once and restoring the latest local draft. Failed local storage checks show a warning without preventing drawing. A blank, unchanged draft does not bypass the introduction.

Initial document loads show a small pencil-stroke loader before revealing the header and main content together with a 150ms fade. Home waits for submission status and restored editor readiness, or for the submitted image to decode. Gallery waits for data/layout but not thumbnails; shared drawings wait for their main image. There is no minimum loading delay. Reduced motion disables animation and the fade. A 15-second stall exposes retry and stops animation; a late successful response can still reveal the page. In-page view changes retain their existing local loading state.

## Touch workspace

Finger input targets 24 screen pixels above contact, including line and fill. A 24px interactive strip below the square canvas is available on coarse-pointer devices; it is excluded from exported images. Mouse and pen remain direct. The hollow brush-shaped cursor uses contrasting outlines, with red for erase and a small circular target for fill. Compact spacing covers widths through 380px and phone viewports through 700px high; 320×650 is the regression target. Full-screen sizing budgets for the strip and keeps 44px controls.

## Share card layout

The 1200×920 PNG centers its card content at 85% scale, leaving decorative outer margins. The headline credits the creator (for example, “Michael drew a singing kite”). The right panel has three equal-height sections for creator, ratings, and site information, with two separators. Ratings are a snapshot at generation time; the “ratings when shared” label is omitted. Link previews remain logo-only and separate from these explicitly generated cards.

## Working agreement

The user runs CLI/npm commands. File edits and the existing browser preview can continue without running new commands.
