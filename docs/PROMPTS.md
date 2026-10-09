# Daily prompt calendar

`src/prompt-calendar.js` contains 26 curated weeks (182 distinct prompts), beginning October 10, 2026 and ending April 9, 2027. The first six weeks follow the reviewed list. Subsequent weeks extend the same editorial approach. Before the start date, the original noun/action mapping remains intact.

## Editorial rules

- Use a familiar subject with one approachable twist. A rough doodle should satisfy it.
- Mix emotions, actions, accessories, materials, proportions, and simple situations.
- Vary phrasing, but every entry must complete “[username] drew [prompt]”. Include articles explicitly; preserve proper-name capitalization.
- Include roughly two familiar named subjects each week. Prefer recognizable silhouettes over detailed likenesses.
- Occasionally use two or three of the same simple subject interacting. Avoid crowds and complicated scenes.
- Rotate subject types so animals, food, objects, and places do not dominate successive days.
- These are invitations, not drawing requirements. Scenery, props, and accurate likenesses are optional.

## Scheduling and extending

Prompts change at midnight America/New_York, including daylight saving transitions. Calendar indices use whole calendar dates rather than elapsed local hours. The server stores each day's title in Postgres when first requested; its existing title is never overwritten by this calendar. No migration or bulk rewrite of historical prompts is needed.

Append new seven-entry weeks before the current calendar ends. Do not insert, remove, or reorder published entries, or change the start date. Unpublished future entries can be edited in place. If the calendar runs out, it repeats from its beginning so drawing remains available; extending it in advance avoids repeats. Repeated titles have separate prompt dates and galleries.

Share cards and link metadata use the shared caption formatter. It accepts the new complete phrases and retains the article for historical titles such as “singing kite”. Tests cover calendar continuity, uniqueness, caption grammar, the start boundary, and the repeat fallback.
