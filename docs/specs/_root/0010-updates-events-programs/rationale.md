# 0010. Updates, Events and Programs: reasoning

Reasoning, options and the code reading behind [index.md](./index.md). `/develop` skips this file.

## Context

> ⚠️ Premise note: scope feature 15 is a reader, and almost nothing it reads has an author yet. Department messages and department activities (S5-01 to S5-03, S4-01, S4-02) belong to feature 17 in Week 3. Clan messages (F3-13) belong to feature 23 in Week 6. Church event cancellation belongs to feature 18 in Week 4. So a Week 2 feature is being asked to display four kinds of content that nothing in the product can create. The failure mode if that is ignored: the feature ships, three of its acceptance criteria are never seen working, and the data shape is invented a second time in Week 3 by whoever builds the authoring, at which point the reader has to be rewritten. The framing taken here is that this spec owns the contract (the tables, the audiences, the read queries and the member facing surfaces) and the later features write against it, with seeded sample rows making the reader verifiable now. That is a deliberate choice, not an oversight, and it is why AC-11, AC-12 and AC-14 exist.

Members have two places to look for church news and neither is finished. The Updates tab shows church wide announcements only, and although every announcement already stores a `category`, the app never shows it. There is no way at all to see a message addressed to your own department or clan, which is what the SRS calls "My groups". The Events and Programs screen shows upcoming church events and, since spec 0005, a past events archive, but no activities, no end times, no cancelled marking, and nothing that lets a member keep an event.

Four forces shaped the decision.

**The producers come later.** As the premise note says, every writer for this content is a Week 3 or later feature. Whatever shape this spec picks for activities and group messages, features 17, 18 and 23 inherit it.

**The schema and the SRS disagree about activities.** `convex/schema.ts` says `plannedActivities` rows are "Internal planning records, never shown to members". F4-16 and M4-01 say a member sees their departments' and clan's activities in the app. `AGENTS.md` is explicit that the SRS wins and that such a disagreement is a bug to flag, not something to resolve quietly either way. `plannedActivities` also lacks everything M4-02 wants shown: no start or end time (only a `targetDate`), no location, no image, no cancelled state and no clan link.

**Nothing can address a clan.** `notificationAudienceValidator` offers `all`, `department`, `users` and `role`. F3-13 and N27 both need a clan audience. Clan membership today is only `memberProfiles.clanId`, which the member picks themselves in step 5 of the profile wizard, before anyone has checked it.

**Add to calendar is the only native change.** `expo-calendar` is a native module. `apps/mobile/AGENTS.md` is clear that an over the air update never carries native changes and that an installable build comes only from the manual preview APK workflow. So M4-04 cannot reach staging the way the rest of the feature can.

Two existing reads also set the baseline. `listUpcomingEvents` has no horizon at all: it range reads every event from now to the end of time and filters in memory. `listActivePrograms` uses 8 weeks. One merged list cannot honour both.

## Options considered

### Option 1: reader plus the shared data contract (chosen)

This spec defines the member facing tables (`groupActivities`, `groupMessages`), the clan notification audience, the cancellation fields on `events`, the two new deep link types and every member facing read query, and builds all the mobile surfaces. Features 17, 18 and 23 then build their authoring pages against a contract that already exists. Sample rows seeded in dev and staging only make the reader verifiable before any authoring ships.

**Pros**:
- The data shape is decided once, by the feature that has actually traced what the member must see.
- Week 2 finishes a real end to end slice rather than half of one, which is what the project's Tracer Bullet approach asks for.
- Features 17 and 23 get realistic rows to build their pages against on day one.

**Cons**:
- Three acceptance criteria are proved against seeded data rather than against content a human authored in the portal.
- The tables carry no writer for several weeks, so a shape mistake surfaces later, when it costs more.
- Feature 17's own spec has less room to move, since the activity shape is already fixed.

### Option 2: reader only for what exists today

Keep this spec to the announcement category, church events, the detail screen and add to calendar. Move My groups and the activities half of M4-01 wholly into features 17 and 23, which then own both the writing and the reading.

**Pros**:
- Nothing unverifiable ships, and every criterion is provable the day it is built.
- No unused tables sit in the schema.

**Cons**:
- Feature 15 no longer satisfies its own Done when line, so the scope row has to be rewritten and two stories move.
- Features 17 and 23 each design a member facing feed under their own time pressure, which is exactly how the cancellation lookup ended up copied into four read paths in spec 0009.
- The Updates tab stays half a feature through Week 2 and most of Week 3.

### Option 3: full vertical slice, authoring included

Also build department activity and department message authoring now, pulling S4-01, S4-02 and S5-01 to S5-03 forward out of feature 17.

**Pros**:
- Everything is verifiable end to end immediately, by a human using the real product.
- One feature owns both halves, so the contract cannot drift.

**Cons**:
- Those pages live inside the shared department shell, which is feature 17's own deliverable and does not exist yet, so this would build pages before the shell that holds them.
- It roughly doubles this feature and empties feature 17, reordering the agreed build plan rather than following it.

## Rationale

Option 1 follows from the first force in Context. Since features 17, 18 and 23 all inherit whatever shape is chosen, the only real question is who chooses it, and this feature is the one that has walked through what a member has to see on each screen. Option 2 defers that choice to three separate later features working independently, which is the condition that produces contract drift; spec 0009 paid for exactly that lesson when four read paths each had to remember the cancellation lookup and nothing enforced it. Option 3 fails on sequencing alone: the department pages belong in a portal shell feature 17 has not built.

Two new tables rather than growing `plannedActivities` follows from the second force. The Year Planner's rows and a member facing activity have genuinely different lifecycles and audiences, and that comment is not stale documentation, it is a real statement about rows administration uses for internal planning. Adding a visibility flag to one table would put the same trap in every reader that spec 0009 just had to remove: a filter everyone must remember and nothing enforces. A fresh table also means no existing row becomes visible to the church on deploy, which the "all rows visible" variant could not promise without a data check first.

The eligibility rule is split on purpose, and it is the one place this spec reads wider than the SRS. A department roster row exists because an HOD put the person there deliberately, so roster membership alone is enough to read that department's notices in the app, verified or not. A clan is self selected in the profile wizard and nobody has checked it, so clan content requires a verified profile. F4-17 and N27 are left exactly as written, because both are notification stories: who gets pushed stays verified only. The push rule and the in app read rule differ deliberately, which is recorded as an invariant rather than left for a reader to discover.

One merged query rather than two, for the same reason the horizon becomes a shared constant: the sort, the horizon, the tagging and the cancelled marking are one set of rules, and Home (feature 12) needs the identical answer with a smaller limit. One query means one place to change them and no way for the two screens to disagree.

## Evidence: what the code does today

Read during this design, at commit `ec304e4`:

- `apps/mobile/app/(tabs)/updates.tsx` (349 lines): church wide announcements only. "Pinned" is derived from `priority === 'high'`, not stored. `category` is never read. No group content anywhere.
- `apps/mobile/app/events.tsx` (316 lines): `listUpcomingEvents` rows plus the past events grid from spec 0005. Start time only, no end time, no cancelled state, no activities.
- `convex/events.ts`: `listUpcomingEvents` range reads `by_startDateTime` from `now` with no upper bound, then filters `active` in memory. `archiveEvent` sets `active: false`, and its comment says that exists so a mistaken archive is reversible.
- `convex/announcements.ts`: `listActiveAnnouncements` filters published rows to the display window and sorts by priority then recency.
- `convex/schema.ts`: `plannedActivities` has `title`, `description`, `targetDate`, `departmentIds` and a `planned | in_progress | done` status, plus the "never shown to members" comment. `departments.name` and `clans.name` both exist, so a server resolved tag is a direct read.
- `convex/weeklyPrograms.ts`: `UPCOMING_HORIZON_DAYS = 8 * 7`, private to that module.
- `apps/mobile/lib/notification-links.ts`: `resolveDeepLinkHref` switches on `deepLink.type`, so new types are two cases, not a schema change.

## Cross check, 23 October 2026

An independent read of the draft on a different model, before the spec was accepted. It found seventeen gaps, all closed in place rather than deferred. Three were breakages rather than omissions, and they are worth remembering because each came from assuming an existing file was simpler than it is:

- `resolveAudience` in `convex/notifications.ts` ends in an exhaustive `const exhaustive: never = audience`. Adding the `clan` variant to the validator without a matching case would not have compiled, and the draft's AC-11 named only the validator. The clan resolver is now its own build task.
- The portal's announcement Category is a free text `Input` that sends `form.category.trim()`. Validating a fixed set server side while that form stood would have broken announcement editing outright. The select and the validation now ship in one change, and the migration plan says why they cannot be split.
- `convex/contentSeed.ts` requires an explicit `allowSampleData: true` through `assertSampleSeedAllowed`. The draft's verify steps called a seed function that did not exist, with the wrong arguments.

Two were design improvements rather than fixes. The activity indexes became `["owner.departmentId", "startDateTime"]` and `["owner.clanId", "startDateTime"]`, read once per eligible group, rather than one window read over every activity in the church filtered in memory; that bounds the work by the caller's memberships instead of by how many groups exist. And the draft claimed in Consequences that the 8 week horizon narrowed `listUpcomingEvents`, which no build task actually touched, so the claim was false and Home's migration is now an explicit follow up owned by feature 12.

The rest were undecided inputs of the ordinary kind: the window's start boundary, the sort tie break, `limit` semantics, the message and group ids the client needs, per group read caps, image and sender resolution, a missing owner row, duplicate roster rows, heading order, loading and empty states, the Android calendar lookup and the time zone written into it.

## Story ownership checked

| Story | Owner, and why it is not this spec |
|---|---|
| M4-03 weekly programs with cancelled occurrences | shipped, spec 0009 |
| M4-05 past events | spec 0005, In Progress, owns that section on this screen |
| M3-04 expired announcement reads as ended | F4-12, feature 10 |
| M2-06 Home events slot | feature 12, which calls the same merged query with a limit |
| S4-01, S4-02 activity authoring | feature 17 |
| S5-01 to S5-03 department message authoring | feature 17 |
| F3-13 clan messages | feature 23 |
| The events cancel action | feature 18 |
