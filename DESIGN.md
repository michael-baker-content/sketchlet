# Site direction

The site name is Sketchlet, displayed as "sketchlet". Existing browser storage keys retain their original names to preserve drafts and saved preview data.

## Global presentation

Use the drawing studio's current retro-web treatment throughout the application. `retro.css` is the current visual reference.

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
8. Full-screen drawing on phones and tablets; narrow screens use two tool columns, with swatches in color menus.
9. Separate gallery submission and PNG download buttons above a contrasting rules footer in normal view.

`src/gallery.js` is the connected entry point. Gallery submission is the primary action and PNG download is an optional local export. Keep previous local drafts and preview records intact. No sample votes or drawings are migrated automatically. Follow README and DEPLOYMENT.md for setup and release verification.

## Working agreement

The user runs CLI/npm commands. File edits and the existing browser preview can continue without running new commands.
