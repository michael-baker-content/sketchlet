# Accounts and friend groups

## Current stage: account ownership, guest linking, and group membership

The initial group membership layer is available on Profile for signed-in users. See [GROUPS.md](GROUPS.md) for migration `014_groups.sql`, permissions, limits, and required database verification. Group drawing feeds and admin management are the next stages.

`/profile` is a standalone, unindexed account setup preview. Clerk handles email-code and Google sign-in. The Node backend verifies a Clerk session token and idempotently creates an internal account in Neon. No email, password, or Clerk secret is sent to the public account response. Internal account IDs and owner hashes are independent of Clerk user IDs; mappings are scoped to the Clerk instance so development and production users cannot collide.

Sign-in and sign-up return to `/profile`. After server verification, a persistent confirmation panel announces success and receives focus. Verification failures offer an inline retry. A guest review lists all drawings proved by this browser's guest cookie, presenting same-day conflicts side by side with no default selection. Linking requires a choice for every conflict plus an explicit checkbox and button. Changing a choice clears consent. The database rechecks the reviewed list while holding transaction locks; if it changed, the user must reload the review and consent again. Review errors do not remove the signed-in confirmation, and sign-out clears the review.

The header links to standalone `/profile` for guests and accounts. It contains name/photo editing, a five-drawing preview linking to the paginated personal gallery, account controls, and guest linking. Only the small name-entry dialog needed to continue rating remains on gallery pages. Signed-in API requests use the verified account owner for drawings, names, ratings, and reports. Existing guest work remains separate until linked. Drafts and guest photos stay device-local. Account photos sync privately as described below; groups are a later release.

## Private account photos

Every page initializes its navigation avatar through the shared `site-header.js` module, including Info and policy pages. Account photos use authenticated requests; guest photos remain device-local. Information content stays readable without JavaScript or a successful avatar request.

Migration `010_private_avatars.sql` adds an account avatar object key. Apply it before deploying this feature. `/api/profile/avatar` uses the existing verified owner resolver, requires bearer authentication and an account record, and supports GET plus same-origin, rate-limited POST. It never accepts another user's ID or a storage key from the client. Reads return inline JPEG data with `private, no-store`; neither object keys nor avatar URLs appear in public APIs. Objects live under `avatars/` in the existing private drawings bucket, without a new storage service.

The server bounds input, decodes and normalizes it to a metadata-free 256px JPEG. Replacement/removal updates the private pointer and attempts cleanup of the old object. Failed cleanup or concurrent replacements can leave unreachable objects for storage reconciliation; they do not make photos public. Ambiguous database failures preserve new objects rather than risking deletion of a committed photo.

Account photos stay in browser memory, never in guest localStorage. Existing browser photos have an explicit selection button and are uploaded only on Save. Selecting a browser photo can replace an existing account photo; it never happens on sign-in. Removal affects the account photo on future reads across devices, while the original guest photo remains independent. Header loading clears stale identity images and does not fall back to a guest image on an expired session. Photos refresh on navigation and local profile changes, not by continuous polling.

Verify upload, replacement, removal, a second signed-in browser, account switching, guest preservation, and expired-session behavior. Unit tests cover owner isolation and normalized storage; browser coverage exercises explicit import and a second browser context.

Linking preserves drawing IDs, URLs, objects, moderation state, and received ratings. Users choose the account or incoming drawing for each overlapping date. Moderation remains in effect even for a selected drawing. Unselected drawings remain stored but are excluded by the shared public visibility view and inaccessible through public links or user galleries. New exclusions have reason `not selected during account merge`, account association, source owner hash, and selected drawing ID in `sketchlet_link_conflicts`; older automatic exclusions retain their original reason. Displaced account drawings receive a distinct inaccessible owner hash to preserve the one-entry-per-owner/day constraint. They carry a separate account-linking reason, also shown in the admin panel; moderation cannot restore them. The account name wins if a profile already exists, otherwise the guest name is adopted. Outgoing votes are combined (account vote wins duplicates), self-votes removed (including votes on displaced work), and reports consolidated. The guest claim is permanent and repeat-safe for the same account; another account cannot claim it.

Migration `009_merge_choices.sql` enables these choices for both local linking and transfer codes. Each additional browser/address can be imported independently into the same account. Old clients may still import nonconflicting work, but must reload to resolve conflicts. The server requires exactly one selection per reviewed conflicting pair and rejects missing, extra, or unrelated selections before writing. Review revisions include both drawing IDs and preview availability, so replacing an account entry invalidates another pending review. Previously linked accounts (including a separate Clerk development account) cannot be merged using guest codes.

A future opt-in gallery of unselected drawings is a backlog idea only. Retention of the merge tag does not publish these images or grant permission to republish them. Unfinished drafts remain out of scope.

### Account ownership inspection

`node scripts/inspect-account-drawings.mjs "Display Name"` is a read-only inventory by display name. Names are not unique; recovery must use confirmed internal account IDs. This maintenance tool is not part of the public build and does not transfer drawings.


Database triggers serialize identity writes with linking and reject writes using a retired guest identity. The server rotates retired guest cookies instead of treating them as account credentials. Sign-out preserves unlinked guest cookies; only retired or missing identities receive a new cookie. A non-authenticating browser hint loads Clerk for signed-in API requests; guests do not wait for Clerk. Missing/expired account sessions fail rather than silently submitting as a guest. Visit `/profile` to reconnect or return to guest use. Drawing strokes still run entirely locally and do not contact Clerk or Neon.

### Moving guest work between addresses

Migration `008_guest_transfers.sql` adds short-lived transfer codes. On the original address, `/profile` can create a code using the HttpOnly guest cookie without signing into Clerk. Issuance requires an allowed request origin (the old `https://sketchlet-blush.vercel.app` address is explicitly permitted for issuance only). Codes contain 256 random bits, expire in 15 minutes, and only their SHA-256 hashes are stored. Each guest has one code record; issuing another invalidates the old code. Keep the code private: it grants the ability to claim that guest's work.

On the destination profile, sign in and enter the code to review dates and conflicts. Explicit confirmation reuses the locked linking transaction. Consumption and ownership changes commit together; repeat confirmation by the same account returns the result until expiry, while another account cannot consume it. Codes are not put in URLs, logs, or persistent browser storage. Drafts and local photos are not transferred. Both addresses must use the same database and updated deployment. Never redirect the old address until migration is no longer needed.

Run the normal checks and browser tests, plus the optional disposable-database integration test, after applying the migration. Manually verify the two-address flow using disposable guest drawings before transferring real work. Browser tests use mocked account services and do not prove live Clerk or database configuration.

## Local setup

1. Create a Clerk development application with email verification codes and Google enabled. Clerk Organizations is not used. The frontend loads Clerk's browser SDK and UI via script tags; no Vite or React migration is needed.
2. Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local`. The dashboard's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` labels are accepted aliases. Both keys must belong to the same instance and test/live environment. Only the publishable key and its frontend hostname are exposed by `/api/account/config`.
3. Run `npm install @clerk/backend` to record the backend SDK and update the lockfile. The agent has not installed it or changed the dependency lockfile. Commit the resulting package changes along with the source.
4. Run `npm run db:migrate` to apply all migrations, including `006_accounts.sql`, `007_guest_linking.sql`, `008_guest_transfers.sql`, and `009_merge_choices.sql`. These add account/link tables, transfer codes, explicit conflict choices, SQL functions, write guards, and the updated public visibility view. Migration does not itself transfer or hide any drawings. The migration reader supports dollar-quoted function bodies.
5. Run `npm run check`, `npm run test:browser`, and `npm run build`, then restart the local server.
6. Open `http://localhost:5173/profile` directly. Test email-code and Google sign-in, server-confirmed registration, refresh, sign-out, and sign-in again. The same Clerk user must reuse the existing internal account.

For this linking update, migrate before restarting the local server, then run checks, browser tests, and build. No new dependency is needed. Test both sign-in methods, review without confirming, and then an intentional link. Confirm the home page recognizes an account's completed day, eligible drawings keep their URLs, and sign-out no longer exposes account ownership. The automated browser tests mock Clerk redirects, so the live return-flow check remains necessary.

## Database verification before release

Ordinary unit/browser tests do not execute PostgreSQL functions. The opt-in `tests/account-linking-db.test.mjs` integration test must pass against a disposable Neon branch before release. It creates and removes only its own randomly named schema, applies all migrations twice, checks ownership/visibility/name/vote reconciliation, stale reviews, repeated claims, retired identity writes, and a concurrent guest submission. It never reads `.env.local` or falls back to `DATABASE_URL`.

In your terminal, set `SKETCHLET_TEST_DATABASE_URL` to that disposable branch's connection string, then run:

```powershell
node --test tests/account-linking-db.test.mjs
```

Remove the variable afterward with `Remove-Item Env:SKETCHLET_TEST_DATABASE_URL`. Without it, the regular test run reports this integration test as skipped. Do not treat that skip as database validation. The branch role needs permission to create schemas. These tests use fixture records and no object storage, emails, or real Clerk sessions.

The application origin allowlist is shared with the existing API (`APP_ORIGIN`, localhost default, or exact Vercel deployment origins). Account registration requires an allowed Origin and accepts no browser-supplied ownership fields. Only Clerk session tokens are accepted; a guest cookie never authenticates an account. GitHub administrator authentication remains independent and grants no privileges to Clerk accounts.

Automated account-handler tests use injected verification/storage, and browser tests mock Clerk scripts and requests. They do not prove live Clerk configuration or execute migrations. Never submit real credentials to test fixtures. Only the opt-in database test executes migrations. Normal guest drawing does not wait for the auth provider.

## Agreed next stages

Group creation, discovery, join requests, and membership roles now have an initial implementation on `/profile`; [GROUPS.md](GROUPS.md) distinguishes implemented features from remaining work. Gallery filters and admin oversight follow this foundation. Clerk establishes identity; Neon remains the source of group roles and permissions. The list below records the full agreed direction, including features not yet implemented.

1. **Verify guest linking and account ownership.** Implementation is in place; run the disposable-database test and live account checks above before release. Test account-session expiry and switching accounts on a shared browser as well.
2. **Verify `/profile`.** The page conversion is implemented. Check direct navigation and reload, guest editing, account switching, name/photo saving, removed drawings, pagination, name entry during rating, and the initial group membership controls.
3. **Groups and approvals.** Neon owns groups and memberships. Names are unique case-insensitively, with numeric suffix suggestions when taken. Optional description, listed/unlisted, join requests always require approval—including requests from invitation links. Members can belong to multiple groups.
4. **Roles.** Owner can rename, manage members, grant/revoke approvers, transfer ownership, and delete the group. Approvers can accept/decline requests and toggle listed/unlisted; no delegated rename/removal powers initially. Members can leave. No group-level drawing hiding.
5. **Visibility and gallery.** Everyone / my groups / one group filters, deduplicating drawings in the combined view. Groups show all historical drawings by current members; leaving removes that association. Nonmembers see only name, description, and join request. Only members see roster/group gallery. Unlisted groups stay out of search and public profile associations. Individual drawings remain public; unlisted does not mean private artwork.
6. **Admin oversight.** Search all groups, rename, change listing status, manage members/roles, transfer ownership, disable groups, and audit administrative changes. Disabling never deletes drawings. Existing site-wide moderation applies in all group views.

## Before production accounts

Production's intended origin is `https://sketchlet.app`; see the domain transition section in [DEPLOYMENT.md](DEPLOYMENT.md). Localhost keeps its own origins and development Clerk instance. A new domain cannot read the old Vercel domain's guest cookie or device drafts, and development-account linking does not automatically transfer work to a production Clerk account.

Before pushing accounts to the production branch: pass the ordinary checks, browser tests, build, and opt-in database test; verify both production sign-in methods on `sketchlet.app`; and review privacy disclosures and account deletion/retention behavior. Development sign-in success does not verify production configuration. Groups do not need to be implemented before releasing accounts. Their later release requires server-side membership checks and permission-race tests.
