# Administration

The separate `/admin` page provides GitHub sign-in restricted to one account, submission and report review, and the latest 50 administrative activity entries. It does not load the drawing editor or change the visitor's guest identity.

Choose **reports** to review open or resolved reports, or **submissions** to browse all/public/hidden drawings. Lists load in pages of 24. Review a drawing to hide it, restore it, clear its creator's display name, or resolve an individual report. Hiding requires a standard reason shown to the creator; notes remain private in the activity log. Report explanations and creator names are displayed as text.

Hiding a drawing does not resolve its reports automatically. Resolving a report does not change visibility. Name clearing applies across that creator's drawings and permits them to choose a new name; it is not a name-change restriction. Clearing the visitor's browser data can reset their guest identity, so neither duplicate prevention nor future guest restrictions should be described as account-level enforcement.

## Set up sign-in

The owner runs the commands and configures credentials. No additional npm packages are required.

1. Run `npm run db:migrate` to apply `db/004_admin_foundation.sql` and `db/005_moderation.sql`. The migrations create OAuth challenges, admin sessions, action history, drawing moderation, reports, and a shared public-drawings view. Run this **even if sign-in already works**, before restarting/deploying the new code. Existing drawings stay public, and no drawings or votes are deleted.
2. Register a **dedicated GitHub OAuth app** under GitHub Settings → Developer settings → OAuth Apps. Do not reuse an app that has repository permissions. This integration requests no additional scopes and only reads the signed-in account's public identity.
3. For production, use the site's exact origin as the homepage URL and append `/api/admin/callback` for the authorization callback URL. For the current domain, those values are `https://sketchlet-blush.vercel.app` and `https://sketchlet-blush.vercel.app/api/admin/callback`.
4. Set the following variables in Vercel's **Production** environment. Keep the client secret out of Git and chat.

| variable | value |
| --- | --- |
| `ADMIN_ORIGIN` | `https://sketchlet-blush.vercel.app` (or the chosen canonical domain, with no trailing slash) |
| `ADMIN_GITHUB_ID` | Your account's numeric GitHub user ID, not its username |
| `GITHUB_CLIENT_ID` | The OAuth app's client ID |
| `GITHUB_CLIENT_SECRET` | The OAuth app's client secret |

`DATABASE_URL` is also required. The authorized identity is compared by numeric ID on every authenticated request, so a changed username does not change access. The ID can be obtained from GitHub's public `https://api.github.com/users/USERNAME` response. Confirm it belongs to the intended account before setting it.

For local testing, register a **second OAuth app** with homepage `http://localhost:5173` and callback `http://localhost:5173/api/admin/callback`. Put its credentials, your account ID, and `ADMIN_ORIGIN=http://localhost:5173` in `.env.local`. Restart the local server after changing backend files or environment variables. Local and production sessions are separate. Production credentials should not be enabled on arbitrary preview hosts; a preview needs its own origin, OAuth app, and isolated database.

The sign-in button stays unavailable if configuration is incomplete. No temporary password, guest-cookie shortcut, or development authentication bypass exists. The public site continues to work without admin variables.

## Verify the update

```powershell
npm run check
npm run test:browser
npm run build
```

Automated tests mock GitHub and database/storage calls; they never sign in to GitHub or write to Neon. Browser tests use the real interface with mocked API replies. They cover authorization, input validation, public visibility query boundaries, owner notices, reporting, and review interactions. They do not replace a real database/storage smoke test:

- Open `/admin` and sign in with the authorized account. Confirm the account name and a sign-in activity entry.
- Sign out, then reload. Activity must no longer be accessible. `/api/admin/activity` without an admin session must return 401.
- An unauthorized GitHub account must not gain access. The visitor guest cookie alone must not grant admin access.
- Home, gallery, and drawings should still behave normally. Signing in as admin does not take ownership of guest drawings.
- Report a test drawing from another browser without entering a name. Confirm the report appears, and a second report from the same guest does not create a duplicate.
- Hide that drawing with a reason and private note. In another browser, verify it disappears from its prompt gallery, archive cover selection, and rating queue. Its shared page and direct `/api/drawings/ID/image` URL should return unavailable/404.
- In its creator's browser, home (if today's submission) and profile history should show a removal notice without artwork or sharing controls. There must be no replacement canvas for that day. Private notes must never appear there.
- Restore the drawing and confirm public access returns. Resolve its report separately. Check the audit details include the action, previous/new state, and private note.
- Clear a test display name and confirm it disappears from all that creator's public drawings. The creator can enter a new name.

Public drawing image responses and drawing-page metadata now use `no-store`, so new requests recheck visibility. Already-open pages, images cached under the previous release, externally cached social previews, downloaded images, and previously generated share cards cannot be retroactively erased. Private objects remain in storage for reversible review; admin image requests independently require a valid admin session.

Reports allow seven categories and up to 1,000 characters of optional explanation. The database enforces one report per guest/drawing, including resolved reports. Additional limits allow five report attempts per guest and ten per network address per minute, alongside the existing general request limits. Reports alone never remove content. Report rows and audit history are retained; no automatic cleanup or email notifications are included yet.

## Security and sessions

- Authorization-code sign-in uses PKCE and a random state bound to an HttpOnly browser cookie. Challenges expire after ten minutes and are consumed atomically in Postgres, preventing callback replay across server instances.
- Admin sessions use random tokens in HttpOnly, SameSite=Lax cookies. Production cookies use Secure and the `__Host-` prefix. Only token hashes are stored in Postgres. Sessions expire after eight hours without automatic extension; sign-out revokes them on the server.
- GitHub tokens are used only during sign-in and are not persisted or returned to the browser. No repository or email scope is requested.
- Requests must use the configured admin host. POST requests require an exact Origin match; authenticated writes also require a session-bound CSRF token. Login attempts are limited to ten per minute per network address.
- The admin document uses `Referrer-Policy: same-origin` so its sign-in form retains the Origin header. Auth endpoint responses keep `no-referrer`, including the OAuth callback. Do not permit null origins to compensate for a document policy that suppresses them.
- Admin responses use `private, no-store`; the admin document and endpoints request no indexing. The HTML shell is public and contains no private data. Every protected API operation independently checks the session and allowed account ID.
- Expired challenges are removed when sign-in starts. Expired sessions are removed when a new session is created; expired rows cannot authenticate even before cleanup. Activity history is retained. Disabling admin configuration disables access; changing the allowed ID immediately rejects sessions belonging to the previous ID.

## Following slices

1. **Guest restrictions:** separate controls for drawing, rating, and name changes. Existing drawings remain public unless explicitly hidden.
2. **Prompts and corrections:** future prompt overrides and deliberate submission reassignment, preserving daily submission constraints and recording changes.
3. **Email alerts:** deferred until the review queue works well.

Hidden drawings are excluded from public galleries, rating queues, public shared pages, and image delivery. Owners see a removal message and reason; removal never grants a replacement drawing for that day. Public visitors see a neutral unavailable message. Drawings remain immediately public until a future approval workflow is deliberately enabled. The reserved `pending` state is non-public, but no pre-publication approval workflow is exposed yet.

Optional public accounts are separate future work. Admin permission must never follow automatically from an ordinary successful sign-in. Linking a public account to existing guest drawings and votes needs its own verified flow; this admin foundation deliberately leaves guest ownership unchanged. GitHub can remain an admin provider even if public accounts later use different providers.

Provider reference: [GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
