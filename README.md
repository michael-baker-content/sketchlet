# Sketchlet

A daily drawing app with a retro web interface. Visitors draw a shared action-and-noun prompt, save one final drawing per day to a gallery, and rate other drawings. Neon Postgres stores prompts, submissions, and votes; the private `drawings` bucket stores PNGs. No user-facing login is required.

## Local setup

Requires Node.js 22.20 or newer. The user runs CLI/npm commands. Dependencies are pinned in the committed lockfile:

```powershell
npm ci
npm run db:migrate
npm test
npm run dev
```

Stop the old server with Ctrl+C before starting the new one. `npm run dev` runs `local-server.mjs`. Migrations apply the numbered SQL files in `db/` to the database specified by `.env.local` (currently the linked Neon production branch). They do not drop tables and are safe to rerun. For isolated testing, use a Neon development branch and pull its environment before migrating.

Open http://localhost:5173. If credentials, packages, or tables are missing, drawing still works, but gallery saving is disabled or reports an error. The application does not silently treat local preview saves as gallery submissions.

Neon environment variables live in `.env.local`; see `.env.example` for variable names without values. `neon env pull --service postgres --service object-storage` refreshes these settings. Keep `.env*`, `.neon`, and `node_modules` out of Git. Commit `.env.example`, `neon.ts`, migrations, application source, package.json, and the updated lockfile.

## Drawing and gallery

Square 1200px canvas; mouse, touch, and pen input; 24 ink/background colors; three sizes and solid, dashed, and rough brushes; transparent eraser; 60 undo steps plus redo; undoable clear; local IndexedDB draft; and a 60ms trailing animation respecting reduced motion. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes. History lasts for the current session.

The primary action is **save to gallery**, followed by a final-submission confirmation. Uploads are decoded and re-encoded as PNGs on the server. The database enforces one submission per guest per prompt, one vote per guest per drawing, and star values from 1 to 5. Private bucket objects are read through the server; credentials never go to the browser. Individual drawings have `/d/<uuid>` URLs. Links are local-only until hosted.

A random HttpOnly guest cookie identifies the browser; only its hash is stored in Postgres. Clearing cookies creates a new identity, so this is not strong anti-abuse protection. No email/password service is configured. Direct drawing links are viewable; the interface requires today's submission before entering the rating queue. Shared-link immediate voting remains a product decision.

Prompt dates are computed by the server in `America/New_York`. Old prompt titles are retained once recorded. Drafts are saved under separate daily keys and only restored for their matching date; switching days also clears undo/redo and the previous background. Focus, visibility, and midnight checks refresh the prompt while the page is open. Save review and final confirmation verify the server date, and snapshots retain their original date even if midnight passes. Old daily drafts, local preview submissions, and the undated legacy draft remain stored; undated drafts are never assigned to a new prompt automatically. There is no old-draft recovery interface yet.

## Project structure

- `src/studio.js` and `src/model.js`: drawing and draft persistence.
- `src/gallery.js`: connected daily, submission, gallery, and rating interface.
- `src/flow.js`: preserved earlier preview implementation; not loaded by the app.
- `src/prompts.js`: shared prompt/date logic.
- `backend/api.mjs`: server-only Neon and S3 integration.
- `backend/public-files.mjs`: explicit public asset allowlist.
- `db/` and `scripts/migrate.mjs`: database setup and shared write limits.
- `api/index.js` and `vercel.json`: Vercel routing and function adapter.
- `scripts/build.mjs`: copies only public files into `dist/`.
- `retro.css`, `playful.css`, `styles.css`, `flow.css`: styling.

## Validation before the initial commit

Automated checks: `npm test` (drawing history, malformed drafts, asset access rules, Eastern date boundaries), and `node --check backend/api.mjs`, `node --check src/gallery.js` for syntax. These checks have not been run for this integration pass because commands are user-managed.

After installation, migration, and restart, verify in the browser:

1. Existing draft restores. Canceling save preserves it.
2. Saving creates an image in the private bucket and a drawing record. Reload and revisit its URL.
3. Repeated submission returns the existing drawing. The guest cannot rate its own image.
4. A separate browser identity can view the image, submit its own drawing, and rate. Repeating a vote does not add another vote.
5. Archive and averages reflect database records. PNGs remain readable after restart.
6. `/.env.local`, `/.neon`, `/backend/api.mjs`, and `/local-server.mjs` return 404 without content.

Do not call the integration verified or commit-ready until these checks pass. No Git repository has been initialized by the agent.

## Before public deployment

Vercel is the selected host. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for import settings, secrets, migrations, Git commands, and verification. The deployment build never runs migrations. Guest-specific responses are not publicly cached; cookies use Secure on Vercel, and POST origins are checked against exact configured deployment URLs. Shared write limits live in Postgres. Add moderation/reporting and orphaned-image reconciliation before broad public use. Gallery results are capped at 200 drawings and 90 prompt dates pending pagination.

Fonts load from Google Fonts with local fallbacks. Drafts are browser/origin-specific. Clearing browser data removes them.
