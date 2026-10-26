# Deploy Sketchlet on Vercel

Vercel serves public assets from `dist/`, runs the application API through `api/index.js`, and renders public page metadata and social images through `api/pages.js`. Neon remains the database and object storage provider. No new storage service or authentication provider is needed.

## 1. Check locally

**Groups:** apply `014_groups.sql` before deploying group membership controls. Complete the disposable-database permission checks in [GROUPS.md](GROUPS.md). This stage adds creation, discovery, requests, and role management on Profile; group drawing feeds and admin oversight remain next-stage work. Existing Clerk configuration is reused.

**Announcements:** apply migrations through `013_announcement_links.sql` before deploying the announcement editor, homepage descriptions, and readable links. See [announcement publishing and verification](ANNOUNCEMENTS.md). Scheduling is handled by database-time visibility on page loads; no cron configuration is needed.

**Private account photos:** apply `010_private_avatars.sql` with `npm run db:migrate` against the deployment database before deploying the avatar update. It reuses the existing private bucket and credentials. No new environment variables or packages are needed.

Accounts use `@clerk/backend`, optional Clerk keys, and migrations through `009_merge_choices.sql` (including `008_guest_transfers.sql`). Follow [ACCOUNTS.md](ACCOUNTS.md) for local and disposable-database verification. Ensure the production database has transfer-code and conflict-choice migrations even if a separate development database was already migrated. Guest linking changes ownership only after confirmation. No additional dependency is needed if Clerk is installed. Free draw, profile previews, recent favorites, and styling changes need no additional migration. Earlier no-migration notes below apply only to their individual features.

You control terminal commands and server processes. These commands do not deploy the website:

```powershell
npm run check
npm run test:browser
npm run build
```

Run `npm run db:migrate` separately when a release adds database migrations or when setting up a new database. The footer, information pages, and Formspree contact update needs no migrations, dependency installation, environment changes, or draft conversion. The build generates home, gallery, admin, and information-page HTML from the shared page template and copies the other explicitly allowed public assets into `dist`; it does not load credentials, run migrations, or alter Neon. GitHub Actions runs `npm run check` and `npm run build` on pushes and pull requests without database credentials. Browser tests remain a separate local release check; the workflow does not run them.

After deploying, directly open and reload `/about`, `/privacy`, `/community`, and `/contact`. The first three are publicly accessible drafts with search indexing disabled, not final policies; see [PUBLIC-PAGES.md](PUBLIC-PAGES.md). Verify one real contact submission, its inline confirmation, and the return-home link using [CONTACT.md](CONTACT.md). The Formspree endpoint is already configured in source and is public, not an environment secret.

Social previews are rendered server-side for `/`, `/gallery`, `/gallery?date=YYYY-MM-DD`, and drawing links. All advertise the same 512×512 pixel paintbrush PNG at `/social/paintbrush-v1.png`, derived from the favicon. Open Graph descriptions stay short and `twitter:card=summary` requests a compact card. Legacy social-image URLs also serve the logo; preview generation never accesses artwork storage. The Vercel page function includes the favicon asset. Crawlers do not receive a guest cookie or initialize the editor. Set `APP_ORIGIN` for a custom domain; otherwise the production Vercel URL is used. Messaging apps may retain old previews until their caches refresh. Generated share cards remain separate and unchanged.

Display names are optional (up to 32 characters) and are cached in local storage. The database profile is associated with the existing guest cookie, and every drawing reads its current owner's name. Changing a name therefore updates attribution for earlier drawings too. Names are not unique login credentials and cannot claim another guest's drawings. Clearing the guest cookie or changing domains loses access to that guest identity even if the name is still cached locally.

Run commands from the repository root. After backend changes, stop the running server with Ctrl+C and restart it with `npm run dev`. The local entry point is `backend/server.mjs`. The current profile drawing list, rating, and interface updates require no new migrations or environment variables. Run the checks and build against the latest source before pushing.

### Administrator foundation

Admin and moderation require `db/004_admin_foundation.sql` and `db/005_moderation.sql`. On a database where those migrations have not yet been applied, run `npm run db:migrate` before deploying: public gallery queries depend on the shared public-drawings view. These migrations are additive and do not hide existing drawings; already migrated installations need no migration for the contact-page release. Admin access is optional and stays disabled until its GitHub account ID, OAuth app credentials, and canonical admin origin are configured. Follow [ADMIN.md](ADMIN.md) for setup and the hide/restore/report verification checklist. The public guest experience does not require admin credentials.

## 2. Put the project in GitHub

The project is already hosted on GitHub and Vercel. For routine updates, commit and push the source changes after validation; Vercel builds the public assets from source. Do not commit `dist/` or environment files. Run new migrations before pushing code that requires them.

For a fresh checkout that has not yet been initialized:

```powershell
git init -b main
git add .
git status --short
git diff --cached --stat
```

Before committing, confirm `.env.local`, `.neon`, `node_modules`, `dist`, and `.vercel` are absent from the staged list. `.env.example` is intentionally included and contains no credentials.

```powershell
git commit -m "Initial Sketchlet drawing app with Neon and Vercel support"
```

Create an empty GitHub repository, then run GitHub's displayed commands to add its remote and push `main`. Do not replace an existing remote if the repository has already been configured. No repository, commit, push, or deployment has been created by the agent.

## 3. Import the GitHub repository into Vercel

Choose **Add New → Project**, import the repository, and use:

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Root directory | Repository root |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 24.x (the project supports Node 22.20+) |

`vercel.json` supplies build/output settings, routing, and a 30-second function duration. Select a function region near your Neon project's region in Vercel settings. `HOST` and `PORT` are only for local development and should not be added to Vercel.

## 4. Add environment variables before deploying

Copy these values directly from your local `.env.local` into the project's **Production** environment settings. Do not paste credentials into chat, commit them, prefix them with `PUBLIC_`, or put them in `vercel.json`.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Neon pooled connection string |
| `AWS_ENDPOINT_URL_S3` | The Neon object storage endpoint |
| `AWS_REGION` | The value supplied by Neon (set explicitly; do not use Vercel's region by accident) |
| `AWS_ACCESS_KEY_ID` | Neon object storage access key |
| `AWS_SECRET_ACCESS_KEY` | Neon object storage secret |
| `DRAWINGS_BUCKET` | `drawings` |

`DATABASE_URL_UNPOOLED` and `NEON_BRANCH` are not needed by the running site. Migrations are run explicitly from your terminal, never automatically by Vercel's build.

Set Production `APP_ORIGIN=https://sketchlet.app` (no path). This selects the canonical address for social metadata and permits requests from the custom domain. Keep automatic system environment variables enabled so the API also recognizes exact Vercel deployment URLs during the transition. Never copy the local `APP_ORIGIN=http://localhost:5173` value into Vercel.

### Moving to sketchlet.app

The domain was purchased through Vercel. Associate it with this project's Production deployment and wait for valid DNS/TLS configuration. Then set Production `APP_ORIGIN` and `ADMIN_ORIGIN` to `https://sketchlet.app`, update the production GitHub app callback to `https://sketchlet.app/api/admin/callback`, and redeploy. Configure Clerk's production instance for `sketchlet.app` and use its production keys in Vercel; keep development keys and localhost origins in `.env.local`. Do not assume a development Clerk account and a production Clerk account are the same identity: mappings are intentionally scoped to the instance.

Keep `sketchlet-blush.vercel.app` accessible without an automatic redirect for guest migration. Cookies, drafts, and local photos belong to their original origin and are not moved by DNS or a redirect. Published drawings remain in the same Neon database. After migration `008_guest_transfers.sql` and deploying the updated code to both addresses, create a transfer code on the old address's `/profile` without signing in there. Sign in on `sketchlet.app/profile`, enter the code, review conflicts, and confirm. Codes expire after 15 minutes and must be kept private. Localhost cannot claim the old public site's guest drawings. Drafts and photos are not transferred. See [ACCOUNTS.md](ACCOUNTS.md) for the transfer security model and verification steps.

The repository now uses `sketchlet.app` in public documentation and as the production metadata fallback. Runtime share links and Clerk return URLs remain relative to the site being used, preserving local testing and old links. This repository change does not edit Vercel environment variables, DNS, Clerk settings, or GitHub callbacks.

Deploy after entering the variables. Updating environment settings later requires a redeployment.

## Preview environments

Start with credentials scoped to Production. Without working Preview credentials, home cannot confirm submission status and shows a loading error rather than opening the editor. For working previews, create a separate Neon branch, migrate it, and use that branch's database **and storage** credentials in Vercel's Preview environment. Do not mix production database settings with preview storage. Keep Vercel deployment protection enabled for previews.

## 5. Check the deployed URL

- Today's prompt loads, drawing works, and save creates a gallery entry.
- Both legacy `/d/<uuid>` links and new `/d/<prompt-name>~<compact-id>` links work when opened directly and refreshed. Legacy links update to the readable address after loading. The compact ID preserves the full UUID; no database migration or short-link table is needed.
- “Copy link” appears beside the rating action, copies the readable absolute URL, and announces success. Blocked clipboard access provides a fallback link. Check the action row at 320px.
- “Share card” loads its generator only when requested. Check the preview, correct drawing/name/date/rating totals, image copy on HTTPS, PNG download, close/reopen, and retry after an image-load failure. No card is stored on the server. At narrow widths, the two share actions sit above the rating action.
- Saved images load from the private bucket through the API.
- Rating from another browser requires a saved name but no drawing submission. Self-voting remains blocked. Updating an existing rating changes its stars while keeping the vote count unchanged.
- Refresh restores only the draft for the current prompt date.
- Enter a name when submitting, then edit it using “profile” in the header. Refresh an older drawing owned by the same guest and verify its attribution changes, including when viewed from a different browser. Clearing the name should show “anonymous”.
- Select a profile photo, save, and reopen the profile after refresh. Canceling a replacement should preserve the saved photo; removing and saving should clear it. Photos stay in local storage and are never sent with name updates or drawings.
- Open profile and check “your drawings”: newest first, correct dates and ratings, and links to the corresponding drawing. A separate browser identity should not see these as its own. “Load more” should retain existing cards and add older entries.
- Download a PNG from the drawing view without submitting it. Check that the two save actions fit at 320px and that full-screen mode still omits them and the footer.
- `/.env.local`, `/.neon`, `/backend/api.mjs`, `/backend/server.mjs`, and `/docs/DEPLOYMENT.md` return 404.
- Vercel logs show no missing environment settings, table errors, or storage failures.

Localhost and the hosted domain have different browser storage and guest cookies. Existing drawings in the same Neon database will be visible in the gallery, but the hosted browser will not automatically own drawings created as a localhost guest. Choose the long-term domain early; switching domains changes the guest identity again.

## Initial release limits

### Drawing performance release checks

For the current touch and brush update, verify the 24px upward finger target and bottom drawing strip in normal and full-screen views, including line and fill. Mouse and pen should remain direct. The 320×650 phone regression checks control visibility and bottom-edge drawing; its desktop counterpart is intentionally skipped. Try the stronger pencil and 40%-opacity spray on the actual phone, then reload an older draft to confirm its appearance is preserved. No migration, dependency installation, or environment changes are required.

The refactor retains the 1200×1200 canvas, 60-edit undo history, and existing draft format. Completed strokes are cached; seeded pencil strokes append new grain without an additional canvas buffer. Other brush styles preserve their existing single-fill behavior.

After automated checks pass, use the affected phone to try layered pencil shading over a texture, a long regular-brush stroke, and erasing across overlapping strokes. Check that releasing a stroke, undo/redo, refreshing a saved draft, and switching normal/full-screen views preserve its appearance. Watch for disappearing strokes, altered pixels, or increasing input lag. Browser tests use simulated phone dimensions, not physical phone hardware, and operation counts are not frame-time benchmarks.

### Page-loading release checks

Page-loading regression checks: after the one-time Playwright setup documented in README, run `npm run test:browser`. These use mocked API traffic and require neither Neon nor a running local server. The page separation needs no database migration. `/gallery` and `/d/:id` use the gallery shell; `/` uses the home shell and conditionally loads the editor only after an unfinished-day response. Both shells come from `backend/page-shell.mjs`, which is imported by the public-page function and traced into its Vercel bundle. The build also generates `dist/index.html` and `dist/gallery.html`; the root HTML source files are no longer needed. The favicon remains explicitly included in the page function for social image generation. No hosting settings or environment changes are needed for this template refactor.

After deployment, open and refresh `/gallery` and a shared drawing link directly: neither should show the drawing tools or today's home view. Home should show instructions for a fresh day, restore an existing draft, or show the submitted drawing for a completed day. Check that the header, loader, favicon, and styling appear on both page types.

### Remaining limits

- JSON uploads are capped at 4,000,000 bytes to leave room below Vercel's 4.5 MB function limit. Large drawings show a clear error without losing the local draft. A future direct-to-storage upload flow can remove this limit.
- Postgres enforces 40 POST requests/queue loads per guest and 120 per client IP per minute across function instances. Network keys contain hashes rather than raw IP addresses. Vercel requests use its overwritten `x-forwarded-for` header; local requests use the socket. No new environment variables or migration are required for this rating update. Shared networks share this allowance. Vercel Firewall rules remain an additional deployment-level option, not configured by this change. Rate-limit records can be pruned periodically.
- Rating queue candidates are ranked across the full archive before a bounded batch is selected. Both current-day and archive candidates get low-count and favorite slots. Large galleries may eventually need cached aggregates or a dedicated queue; query cost still grows with the collection.
- Gallery reads are capped at 200 drawings and 90 prompt dates; pagination and moderation/reporting are future work.
- An interrupted save can leave an unreferenced storage object. A reconciliation job is still needed for long-term housekeeping.

References: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [build settings](https://vercel.com/docs/builds/configure-a-build), [function limits](https://vercel.com/docs/functions/limitations), [AWS environment variables](https://vercel.com/kb/guide/how-can-i-use-aws-sdk-environment-variables-on-vercel).
