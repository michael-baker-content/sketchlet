# Site announcements

Run `npm run db:migrate` to apply announcement migrations through `013_announcement_links.sql` before deploying. No new packages, environment variables, or cron jobs are needed.

Announcement links use `/info#title-words~compactIdentifier`. The title-based slug is saved when the post is created (backfilled for existing posts), so subsequent title changes do not break links. The URL-safe identifier retains all UUID bits to avoid collisions. Existing `/info#announcement-UUID` anchors remain available. Homepage links and linked announcement headings use the readable address. These remain anchors within Info's latest 50 published posts, not standalone announcement pages.

The optional short description accepts up to 240 characters of plain text and appears beneath the title on home. Its own homepage preview is separate from the full announcement preview. Existing announcements default to an empty description; edit them to add one. Leaving it blank shows only the title, with no generic placeholder description.

In `/admin`, the announcements section offers a title, message, preview, and publishing time. Paragraphs, **bold text**, and `- ` bullet lists are supported. Titles allow 120 characters; messages allow 10,000.

Use `[open your profile](/profile)` for site links or `[visit a site](https://example.com)` for external links. Links open in the same tab; only HTTP(S), root-relative site paths, and fragment targets are supported. Raw HTML remains literal text.

Paste an HTTPS YouTube watch, youtu.be share, Shorts, live, or embed URL in its own paragraph (blank lines before and after) to show a responsive video player. Use a Markdown link when you want a link without a player. The admin preview uses the same renderer as published posts. Players load lazily, use YouTube's privacy-enhanced `youtube-nocookie.com` domain, and do not autoplay. A “watch on YouTube” link remains available if the owner disables embedding or playback fails. Only individual videos are supported; playlists, start-time parameters, other providers, and arbitrary iframe HTML are not supported. Original URL tracking parameters are discarded.

- Save draft keeps a new post private.
- Publish now makes it public immediately. Editing a published post and choosing Save published changes updates the live message.
- Schedule uses the browser time zone printed beneath the field, then sends an absolute UTC timestamp. Choose a future time and press **schedule**; entering a time and pressing **save draft** does not schedule it. The saved-status box and list show the confirmed date, time, and time zone. Reopen a post to check its saved schedule.
- Unsaved edits are marked separately from the saved status. Save confirmations remain visible even if the subsequent list/activity refresh fails. An unconfirmed save asks you to refresh and reopen the post before retrying, since a lost response does not prove the server rejected the save.
- Unpublish to draft removes the post from subsequent public page loads and cancels a scheduled release. There is no permanent delete control.
- Opening another post warns about unsaved edits. Conflicting revisions are rejected; refresh the list and reopen the post to review the latest version. Failed saves retain the editor text.

Published announcements appear newest-first on `/info` (up to 50). The latest title links there from home. Server rendering includes only published/scheduled records whose timestamp is at or before database time. A scheduled announcement therefore appears on the first page load after its time, without a background job. Already-open pages do not update automatically. Home and Info avoid shared response caching so unpublished content disappears on reload. Announcement retrieval failures leave the home page usable and show a local message on Info.

Admin reads require the existing authorized GitHub session. Writes also require the configured host/origin and CSRF token. Revision checks, per-announcement transaction locks, and audit insertion protect each update. New submissions carry a stable UUID, so an ambiguous successful request cannot create a duplicate on retry. The activity log records title, status, revision, and publication time. Draft bodies are never included in public queries. The admin list shows the 100 most recently edited posts.

Verification: run checks and browser tests, then build. After migrating, manually save a draft, confirm it is absent from Info, schedule a short-future publication, reload Info/home after the time, then unpublish and reload both. Also check concurrent edits from two admin tabs. Automated browser/auth tests use fixtures and do not execute the production database transactions.
