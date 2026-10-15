# 0005. Devotionals and past events

**Date**: 2026-10-15
**Status**: In Progress

## Summary

Give members a daily devotional on the mobile Home screen and a browsable archive of past church events backed by YouTube links. The Media team authors both from a new Media portal in the web admin, while the Convex backend owns the data and enforces one devotional per date. This spec covers all three surfaces (Convex backend, web admin Media portal, mobile app) end to end, plus the shared validators that already exist from PR #57.

## Requirements

**User stories**:
- As Media, I write and schedule daily devotionals so members always have a morning reading.
- As Media, I archive past church events with YouTube links so the congregation can revisit recordings.
- As a user, I read today's devotional on Home and browse recent ones so I stay spiritually nourished.
- As a user, I browse past events as video thumbnails and open them in YouTube so I can catch up on what I missed.

**Acceptance criteria** (the contract):
- **AC-1**: A Media authority (Media department HOD, delegate, or System Admin) creates a devotional with title, scripture reference, body text, and date. The server rejects a second devotional for the same date with a clear error message.
- **AC-2**: The Media portal shows a 14 day planner with coverage status per day and surfaces a warning when tomorrow has no devotional.
- **AC-3**: A user sees today's devotional card on the mobile Home screen; the card is hidden when no devotional exists for today (M2-08: empty sections don't appear).
- **AC-4**: A user browses recent devotionals on a dedicated mobile devotionals screen, reached from a "See all" link on the Home devotional card.
- **AC-5**: A Media authority edits a devotional before or after its publish date.
- **AC-6**: A Media authority adds a past event with title, date, and YouTube link. The thumbnail derives automatically from the video ID at display time using the shared `youtubeThumbnailUrl` helper.
- **AC-7**: A user browses past events as YouTube thumbnails on the mobile Events & Programs screen (as a section at the bottom) and tapping a thumbnail opens YouTube.
- **AC-8**: A Media authority edits or removes (hard deletes) a past event.
- **AC-9**: The web admin portal has a `/media/` route group with its own layout and sidebar, gated to users who hold an active `hod` or `department_admin` roleAssignment scoped to the Media department, or an active `system_admin` role. The sidebar shows only the two built pages (Devotionals, Past events); unbuilt Media pages are not listed.
- **AC-10**: The devotionals and past events pages that PR #57 placed under `/admin/` are moved to `/media/`. Redirects from `/admin/devotionals` to `/media/devotionals` and `/admin/past-events` to `/media/past-events` are added in `next.config.ts`.
- **AC-11**: Every create, update, and delete mutation writes an `activityLogs` row with the actor, the action, the target type and target ID.

## Decision

**Chosen option**: Build the Convex backend from scratch, stand up a Media portal shell in the web admin, rewire Naomi's existing UI from mock data to real Convex hooks (deleting the mock layer), and add two mobile surfaces (Home devotional card, past events in Events & Programs).

## Rationale

See [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

```
devotionals
  title              string         required
  scriptureReference string         required
  body               string         required
  date               string         required   "YYYY-MM-DD" (East Africa Time date key)
  createdBy          Id<users>      required
  createdAt          number         required   unix ms
  updatedAt          number         required   unix ms
  INDEX by_date [date]                         unique enforcement + today lookup
```

```
pastEvents
  title              string         required
  date               string         required   "YYYY-MM-DD"
  youtubeUrl         string         required   the full URL as entered
  youtubeVideoId     string         required   the 11 char video ID, extracted on write
  createdBy          Id<users>      required
  createdAt          number         required   unix ms
  updatedAt          number         required   unix ms
  INDEX by_date [date]                         sorted listing + pagination cursor
```

No relationships between the two tables. Both follow the project's existing document conventions (`createdBy`, `createdAt`, `updatedAt`). Thumbnails are derived at display time from `youtubeVideoId` via `youtubeThumbnailUrl()`, never stored.

**API surface**:

| Function | Type | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `devotionals.listDevotionals` | query | (none) | `Devotional[]` sorted by date desc | Media authority or null | unauthenticated returns null |
| `devotionals.getToday` | query | `dateKey` | `Devotional \| null` | reactive null (returns null for unauthenticated) | none; returns null if missing |
| `devotionals.listRecent` | query | `todayKey, limit?: number` | `Devotional[]` last N where `date <= todayKey` | reactive null (returns null for unauthenticated) | none; empty array if none |
| `devotionals.createDevotional` | mutation | `title, scriptureReference, body, date` | `Id<devotionals>` | Media authority | "A devotional already exists for this date" |
| `devotionals.updateDevotional` | mutation | `devotionalId, title, scriptureReference, body, date` | void | Media authority | date clash, not found |
| `devotionals.deleteDevotional` | mutation | `devotionalId` | void | Media authority | not found |
| `pastEvents.listPastEvents` | query | (none) | `PastEvent[]` sorted by date desc | Media authority or null | unauthenticated returns null |
| `pastEvents.listPastEventsPublic` | query | `limit?: number` (default 20) | `PastEvent[]` sorted by date desc, capped via `.take(limit)` | reactive null (returns null for unauthenticated) | none; empty array |
| `pastEvents.createPastEvent` | mutation | `title, date, youtubeUrl` | `Id<pastEvents>` | Media authority | invalid YouTube URL |
| `pastEvents.updatePastEvent` | mutation | `pastEventId, title, date, youtubeUrl` | void | Media authority | not found, invalid URL |
| `pastEvents.deletePastEvent` | mutation | `pastEventId` | void | Media authority | not found |

The admin list queries (`listDevotionals`, `listPastEvents`) use the reactive null pattern (return null when unauthenticated, throw on authorization failure) consistent with `getAdministrationAuthorityOrNull`. The mobile read queries (`getToday`, `listRecent`, `listPastEventsPublic`) also use the reactive null pattern: they call `getCurrentUser` and return `null` (or `[]`) for unauthenticated callers rather than throwing, so Convex subscriptions survive auth teardown without error toasts. No role check; visitors and members both see devotionals and past events.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `devotionals.getToday` | today's date key | `dateKey` arg passed by the client, computed via `dateKeyFromMs(Date.now())` in East Africa Time on device; refreshed on app foreground and at midnight |
| `devotionals.getToday` | devotional content | `by_date` index lookup with the client supplied `dateKey` |
| `devotionals.createDevotional` | date clash detection | `by_date` index query for existing doc with same date (excluding own `_id` on update) |
| `pastEvents.createPastEvent` | `youtubeVideoId` | `parseYouTubeVideoId(youtubeUrl)` from `@klt-cyber/shared` |
| `devotionals.listDevotionals` | sorted list | `by_date` index, Convex `.order("desc")` |
| `pastEvents.createPastEvent` | `youtubeVideoId` | `parseYouTubeVideoId(youtubeUrl)` from `@klt-cyber/shared`, validated non null |
| `pastEvents.listPastEventsPublic` | thumbnail URL | `youtubeThumbnailUrl(videoId)` derived at display time on the client |
| Media portal layout | Media department ID | `getMediaDepartmentId(ctx)` helper, analogous to `getAdministrationDepartmentId` |
| Media portal layout | user's Media authority | `hasActiveDepartmentRole(ctx, userId, mediaDeptId, ["hod", "department_admin"])` |
| Mobile Home devotional | "See all" navigation | static link to the devotionals browse screen |
| Mobile past events section | YouTube deep link | `youtubeWatchUrl(videoId)` from `@klt-cyber/shared`, opened via `Linking.openURL` |

**Key invariants**:
- One devotional per date (enforced server side in the mutation, not only in the UI). On update, the clash check excludes the document's own `_id`. Convex mutations are serializable; the check then insert requires no additional locking.
- Every `youtubeVideoId` is a valid 11 character YouTube video ID, validated from the URL at write time. On update, the ID is re derived from the (possibly changed) URL.
- The Media department exists in the seed data (name: "Media", exact casing); if unseeded, authority checks resolve false and no mutations succeed
- Mutations are never callable without authentication; admin mutations require Media authority
- Mobile read queries use the reactive null pattern (`getCurrentUser`, return `null`/`[]` for unauthenticated callers). Open to any authenticated user regardless of role.
- `listRecent` filters `date <= todayKey` (arg from client) so future scheduled devotionals are never visible to mobile users. Default limit 14, max 60.

**Security model**:
- **Write access** (create, update, delete): requires `requireMediaAuthority` (system_admin, OR Media department hod/department_admin). Three enforcement layers: (1) coarse middleware (any active role), (2) `/media/` layout (Media department role check), (3) Convex mutation (`requireMediaAuthority`). Layers 1 and 2 are UX; layer 3 is the real security boundary.
- **Read access (admin portal)**: same Media authority gate for the list queries (returns null on teardown, throws on auth failure).
- **Read access (mobile)**: any authenticated user. No role check; visitors and members both see devotionals and past events.
- **No PII, no compliance scope**: devotionals are church authored content, past events are public YouTube links. No regulated data.

**Activity log actions**:

| Action string | Target type | Metadata |
|---|---|---|
| `devotional.create` | `devotionals` | `{ title, date }` |
| `devotional.update` | `devotionals` | `{ title, date }` |
| `devotional.delete` | `devotionals` | `{ title, date }` (stored because the target no longer exists after delete) |
| `pastEvent.create` | `pastEvents` | `{ title, date }` |
| `pastEvent.update` | `pastEvents` | `{ title, date }` |
| `pastEvent.delete` | `pastEvents` | `{ title, date }` (stored because the target no longer exists after delete) |

**Configuration required**:
- No new environment variables. The Media department is resolved by name from the seeded `departments` table, not an env var.

**Critical test scenarios**:
- Happy path: Media HOD creates a devotional for tomorrow, it appears in the 14 day planner, and a mobile user sees it on Home the next day, verifies **AC-1**, **AC-2**, **AC-3**
- Happy path: Media delegate adds a past event with a YouTube link, the thumbnail renders in the grid, a mobile user taps it and YouTube opens, verifies **AC-6**, **AC-7**
- Failure case: creating a second devotional for the same date returns "A devotional already exists for this date", verifies **AC-1**
- Failure case: a YouTube URL that does not match any recognized pattern is rejected on past event create, verifies **AC-6**
- Auth/permission: a Church Administration HOD (not Media) cannot create a devotional; the mutation throws an authorization error, verifies **AC-9**
- Auth/permission: an unauthenticated user gets null from `devotionals.getToday`, not an error (reactive teardown safety), verifies **AC-3**
- Edge case: no devotional exists for today; the mobile Home screen hides the devotional card entirely, verifies **AC-3**

## Build plan

Ordered as Tracer Bullet slices (thin end to end thread through every layer, then thicken). The data model is the coherent target; its migration is a single schema push in task 1 since both tables are new and additive.

1. **Schema + authz foundation**: add `devotionals` and `pastEvents` tables to `convex/schema.ts` (both additive, no migration of existing data). Add `getMediaDepartmentId`, `requireMediaAuthority`, and `getMediaAuthorityOrNull` helpers to `convex/lib/authz.ts`, mirroring the Administration pattern. Satisfies **AC-9** (backend layer), **AC-11** (foundation for audit logging).

2. **Media portal shell**: create the `/media/` route group in `apps/admin/app/(admin)/media/` with a layout that checks Media department authority (redirect to `/unauthorized` on failure), a `MediaSidebar` component (Devotionals and Past events only), and the shell page. Update middleware if needed (the coarse "any active role" check already covers Media role holders). Satisfies **AC-9**.

3. **Devotionals backend**: write `convex/devotionals.ts` with `listDevotionals` (query), `getToday` (query), `listRecent` (query), `createDevotional` (mutation with date uniqueness check), `updateDevotional` (mutation), `deleteDevotional` (mutation with hard delete). All mutations call `requireMediaAuthority` and `logActivity`. Validate inputs with shared `devotionalInputSchema`. Satisfies **AC-1**, **AC-5**, **AC-11**.

4. **Devotionals admin UI (rewire)**: move `devotionals/` from `/admin/` to `/media/`, replace mock data hooks with real Convex hooks (remove `useDevotionalList`/`useDevotionalActions` mock path from `mediaContentData.tsx`). The 14 day planner and "tomorrow empty" warning are already built; just wire them to real data. Satisfies **AC-2**, **AC-5**.

5. **Mobile Home devotional card**: add a devotional card component to the Home screen that subscribes to `devotionals.getToday` (passing `dateKey` computed on device in EAT, refreshed on foreground and at midnight). Shows title, scripture reference, and body preview (full body returned, client truncates to ~140 chars with ellipsis). Show nothing while loading (`undefined`); hide the card entirely when `getToday` returns `null` (M2-08). Includes a "See all" link to the devotionals browse screen. Satisfies **AC-3**.

6. **Mobile devotionals browse screen**: a dedicated screen at `app/devotionals.tsx` listing recent devotionals via `devotionals.listRecent` (passing `todayKey` from device). Each row shows title, scripture, date, with an expandable body. Satisfies **AC-4**.

7. **Past events backend**: write `convex/pastEvents.ts` with `listPastEvents` (query), `listPastEventsPublic` (query), `createPastEvent` (mutation with YouTube URL validation and video ID extraction), `updatePastEvent` (mutation), `deletePastEvent` (mutation with hard delete). All mutations call `requireMediaAuthority` and `logActivity`. Satisfies **AC-6**, **AC-8**, **AC-11**.

8. **Past events admin UI (rewire)**: move `past-events/` from `/admin/` to `/media/`, replace mock data hooks with real Convex hooks. The thumbnail grid, YouTube preview, and stat cards are already built. Satisfies **AC-8**.

9. **Mobile past events section**: add a "Past events" section to the bottom of the Events & Programs screen. Thumbnail grid showing 6 items from `pastEvents.listPastEventsPublic`, each card links to YouTube via `Linking.openURL(youtubeWatchUrl(videoId))`. A "See all" link navigates to a full list screen if more than 6 exist. Satisfies **AC-7**.

10. **Cleanup and redirects**: add 308 (permanent) redirects in `apps/admin/next.config.ts` from `/admin/devotionals` to `/media/devotionals` and `/admin/past-events` to `/media/past-events`. Remove the `mediaContentData.tsx` mock layer and its localStorage seeds. Remove the Devotionals and Past events links from `AdminSidebar.tsx`. Satisfies **AC-10**.

## Consequences

**Positive**:
- The Media team has its own portal, ready for Radio, Recordings, and the other Media pages the SRS defines, without rebuilding infrastructure each time
- Members get daily spiritual content and a video archive, the two lightest lift content features in the SRS
- The existing admin UI from PR #57 is reused almost entirely, with the mock layer swapped out for real data

**Negative / tradeoffs**:
- The Media portal is accessible to HOD and delegate only, not roster members. Roster member access (F3-19) ships with feature #6 (department scoped permissions). Until then, a roster member who should be writing devotionals needs a `department_admin` roleAssignment.
- Devotional body text is plain text, not rich text. If the church wants formatting (bold, links, headers), a future enhancement would add Markdown or a rich text editor. The SRS says "text" without specifying formatting.

**Neutral**:
- Two new Convex tables (`devotionals`, `pastEvents`) are additive and require no migration of existing data
- The `/media/` route group establishes a pattern that every other department portal will follow (Radio, Pastoral, Finance, etc.)

## Follow-up

- [ ] Feature #6 (department scoped permissions) should add F3-19 roster member access to the Media portal when it ships
- [ ] The Media dashboard (SRS §4.9.3: "live status; today's devotional warning; Super T gates still empty; listeners in the last broadcast") is not built in this feature. It should be added when Radio or Super T ships, since most of its cards depend on those features
- [ ] Consider whether a devotional "publish/draft" workflow is needed in a later phase (the SRS does not require one; all devotionals are immediately visible on their date)
