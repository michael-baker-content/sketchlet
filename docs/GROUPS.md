# Friend groups: membership foundation

This first stage lives on `/profile`, below the profile and above guest-drawing recovery. Sign in to create groups, search listed names, request membership, or manage an existing group. Apply `014_groups.sql` with `npm run db:migrate` before starting the updated local server or deploying. It uses existing Clerk accounts and Neon; no new packages or environment variables are needed.

## Behavior

- Names are unique without regard to case. Creation normalizes surrounding/repeated whitespace, supports 3–40 ASCII letters/numbers/spaces/hyphens/apostrophes/underscores, and offers an available numbered alternative on collision. The alternative still needs to be selected and submitted; another person may reserve it first.
- Descriptions allow 400 characters. Names and descriptions render as text, never HTML.
- Listed groups appear in case-insensitive name searches (up to 30 results; narrow the search if needed). Unlisted groups are accessible through `/profile?group=UUID`. That link identifies a group; it never grants membership.
- Requests require approval even when arriving through a shared link. A requester can cancel a pending request. Owners and approvers can approve/decline requests and change the description or listed status.
- Only owners can appoint/revoke approvers, remove approved members, or transfer ownership to another approved member. Ownership transfer demotes the former owner to member. An owner must transfer ownership before leaving; other members can leave directly.
- Nonmembers receive only the group name/description, group identifier, and their own request state. They cannot see members or pending requests. Approved members see the member list; only owners/approvers see pending requests. No email addresses, Clerk IDs, or private avatars appear in groups.
- Drawings remain public under the existing moderation rules. This release does not yet add group drawing feeds, change drawing associations, or grant group managers moderation powers.

Initial limits: 20 owned groups, 100 total memberships/pending requests per account, 200 members/pending requests per group, and 30 group-changing requests per account per minute. Lists cover those limits; search returns at most 30 matching listed groups. There is no group rename/delete or email notification workflow in this stage.

## Permissions and storage

`backend/groups.mjs` verifies the Clerk bearer session, resolves an internal account, and checks allowed origins for mutations. The browser cannot choose its acting account or assign roles directly. Local and Vercel routes use the same handler.

`sketchlet_group_action` locks the group row before reading permissions and writing membership changes. Permission revocations and concurrent approvals therefore serialize. Owner membership is created in the same transaction as the group. Case-insensitive name uniqueness is enforced in Postgres. Group actions append to `sketchlet_group_events`; dedicated admin oversight is the next stage, not yet exposed in the admin panel.

Group rendering has its own loading/error state; a group-service failure does not block profile editing or drawing recovery. Signing out clears the group interface and ignores late responses. Shared-link targets are retained through sign-in redirects.

## Verification

Run `npm run check`, `npm run test:browser`, and `npm run build`. Unit/browser tests cover authentication, input checks, name suggestions, approval UI, nonmember presentation, and safe rendering. They do not execute PostgreSQL permissions.

Before public release, use a **disposable Neon test branch**, set `SKETCHLET_TEST_DATABASE_URL` to its connection string in your terminal, and run:

```powershell
node --test tests/groups-db.test.mjs
```

The opt-in test creates its own random schema, applies all migrations twice, executes the actual group store and SQL functions, verifies membership privacy and owner/approver permissions, tests name collisions and concurrent permission changes, and removes only that schema afterward. It never reads `.env.local` or falls back to `DATABASE_URL`. Without the test variable it is skipped.

Manually verify with two signed-in accounts: create an unlisted group, share its link, request approval, approve it from the owner account, grant/revoke approval rights, and transfer ownership. Also confirm sign-out removes private member details. Do not mistake the default skipped database test for verified database behavior.

## Next stages

1. Member-only group drawing views and the gallery's “my groups” filter, including current members' historical work without duplicate images across groups.
2. Admin discovery and management of groups, with reviewable membership and settings history.
3. Group lifecycle refinements, invitations, richer naming, and any notification requirements after real use.
