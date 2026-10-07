# Deploy Sketchlet on Vercel

Vercel serves `dist/` as static files and runs `api/index.js` as a Node.js function. Neon remains the database and object storage provider. No new storage service or authentication provider is needed.

## 1. Check locally

You control terminal commands and server processes. These commands do not deploy the website:

```powershell
npm run check
npm run build
npm run db:migrate
```

The migrations add shared rate limits and guest display-name profiles. Existing data is preserved. Run the migrations before deploying code that uses profiles. The build copies an explicit list of public files into `dist`; it does not load credentials, run migrations, or alter Neon. GitHub Actions repeats the checks and build on pushes and pull requests without database credentials.

Social previews are rendered server-side for `/`, `/gallery`, `/gallery?date=YYYY-MM-DD`, and drawing links. They include Open Graph and `twitter:card=summary_large_image` metadata, plus a public 1200×630 PNG at `/social/site.png`, `/social/gallery.png`, `/social/prompt/<date>.png`, or `/social/drawing/<uuid>.png`. Crawlers do not receive a guest cookie or initialize the drawing editor. Set `APP_ORIGIN` when using a custom domain; the initial Vercel domain uses the production URL system variable. Preview images are generated from the private drawing object only when a crawler requests the drawing preview and are cached briefly at the edge.

Display names are optional (up to 32 characters) and are cached in local storage. The database profile is associated with the existing guest cookie, and every drawing reads its current owner's name. Changing a name therefore updates attribution for earlier drawings too. Names are not unique login credentials and cannot claim another guest's drawings. Clearing the guest cookie or changing domains loses access to that guest identity even if the name is still cached locally.

Run commands from the repository root. After backend changes, stop the running server with Ctrl+C and restart it with `npm run dev`. The local entry point is `backend/server.mjs`. The current profile drawing list, rating, and interface updates require no new migrations or environment variables. Run the checks and build against the latest source before pushing.

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

For a custom domain, also set `APP_ORIGIN` to its exact HTTPS origin, such as `https://your-domain.example` (no path). For the initial Vercel domain, omit `APP_ORIGIN`: the handler accepts the exact deployment, branch, and production URLs provided by Vercel system environment variables. Keep automatic system environment variables enabled. Never copy the local `APP_ORIGIN=http://localhost:5173` value into Vercel.

Deploy after entering the variables. Updating environment settings later requires a redeployment.

## Preview environments

Start with credentials scoped to Production. Preview builds still load the drawing interface but cannot save until Preview environment credentials are configured. For working previews, create a separate Neon branch, migrate it, and use that branch's database **and storage** credentials in Vercel's Preview environment. Do not mix production database settings with preview storage. Keep Vercel deployment protection enabled for previews.

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

Page-loading regression checks: after the one-time Playwright setup documented in README, run `npm run test:browser`. These use mocked API traffic and require neither Neon nor a running local server. The page separation needs no database migration. `/gallery` and `/d/:id` are rendered through the public-page function with `gallery.html` as their client shell; `/` uses `index.html` and conditionally loads the editor only after an unfinished-day response.

- JSON uploads are capped at 4,000,000 bytes to leave room below Vercel's 4.5 MB function limit. Large drawings show a clear error without losing the local draft. A future direct-to-storage upload flow can remove this limit.
- Postgres enforces 40 POST requests/queue loads per guest and 120 per client IP per minute across function instances. Network keys contain hashes rather than raw IP addresses. Vercel requests use its overwritten `x-forwarded-for` header; local requests use the socket. No new environment variables or migration are required for this rating update. Shared networks share this allowance. Vercel Firewall rules remain an additional deployment-level option, not configured by this change. Rate-limit records can be pruned periodically.
- Rating queue candidates are ranked across the full archive before a bounded batch is selected. Both current-day and archive candidates get low-count and favorite slots. Large galleries may eventually need cached aggregates or a dedicated queue; query cost still grows with the collection.
- Gallery reads are capped at 200 drawings and 90 prompt dates; pagination and moderation/reporting are future work.
- An interrupted save can leave an unreferenced storage object. A reconciliation job is still needed for long-term housekeeping.

References: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [build settings](https://vercel.com/docs/builds/configure-a-build), [function limits](https://vercel.com/docs/functions/limitations), [AWS environment variables](https://vercel.com/kb/guide/how-can-i-use-aws-sdk-environment-variables-on-vercel).
