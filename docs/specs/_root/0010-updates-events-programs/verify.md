# Verify: Updates, Events and Programs · spec 0010 · updated 2026-10-23
_Build notes appended at the end by /develop; read them before running the steps._
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Mobile steps run in the Expo app. Three test accounts are needed: a **grouped member** (verified profile, on two department rosters, clan set), an **unverified claimant** (profile `pending_verification`, one active department roster row, a `clanId` set), and a **visitor** (no roster row, no clan). The seed creates the roster and clan rows for all three, since no portal page writes any of this until feature 17.

## Preconditions

- [ ] `pnpm exec convex run contentSeed:seedGroupSamples '{"allowSampleData": true}'` creates sample activities and messages for two departments and one clan, and the roster and clan rows the three accounts need → AC-14
- [ ] Run it without the argument → it refuses, matching every other sample seed → AC-14
- [ ] Run it against a production deployment → `assertSampleSeedAllowed` refuses, leaving no rows → AC-14, F5-03
- [ ] The seeded rows include a cancelled activity, one more than 8 weeks out, a message older than 90 days, and an event carrying cancellation fields → AC-14
- [ ] Re-run the seed → it is idempotent, creating no duplicates → AC-14

## UI / manual

### Announcement category
- [ ] Updates tab → an announcement with a category shows its chip → AC-1
- [ ] An announcement with no category shows no chip, and the card layout does not collapse → AC-1
- [ ] Tap an announcement → detail shows the same category → AC-1
- [ ] Portal → the announcement form's Category is a select over the shared set, with no way to type a free value → AC-16
- [ ] Set a category to an off set value directly in the Convex dashboard → the app renders it as a plain neutral chip and the screen does not break → AC-1
- [ ] Open that same announcement in the portal and save it → it requires picking a set value → AC-16
- [ ] Call `createAnnouncement` from the dashboard with a category outside the set → it is rejected; call it with no category → it is accepted → AC-16

### My groups
- [ ] Signed in as the grouped member → Updates shows a My groups section below announcements, with one heading per group, each naming the department or clan → AC-2
- [ ] Messages inside each heading are newest first → AC-2
- [ ] A message older than 90 days does not appear → AC-2
- [ ] Each message shows its sender's name and when it was sent → AC-2
- [ ] A message with an image shows it → AC-2
- [ ] Signed in as the visitor → no My groups section renders at all, not an empty box → AC-2, AC-3
- [ ] Signed in as the unverified claimant → the department's messages DO appear; the clan's do NOT → AC-3
- [ ] Headings are in a stable order (group name ascending, departments before the clan) and do not reshuffle between visits → AC-2
- [ ] A group the member belongs to that has no messages inside the window shows no heading at all, rather than an empty one → AC-2
- [ ] A message from an anonymized account (spec 0008) reads as a former member rather than a blank name → AC-2
- [ ] Soft delete a seeded message (set `deletedAt`) → it disappears from My groups on the next read → AC-4
- [ ] Set that member's `departmentMemberships` row to `status: "removed"` → that department's heading and messages disappear immediately → AC-4
- [ ] Add a second active `departmentMemberships` row for a department the member already has → that group still appears exactly once → AC-2
- [ ] Delete a seeded department row outright → its messages drop out rather than appearing under a blank heading → AC-2

### One upcoming list
- [ ] Events and Programs → church events and the member's group activities appear in one list, in date order, interleaved → AC-5
- [ ] Each row carries a tag: `Church` on an event, the department or clan name on an activity → AC-5
- [ ] Rename a department in the portal → the tag follows the new name without an app reload beyond the reactive update → AC-5
- [ ] An event more than 8 weeks out does not appear → AC-5
- [ ] An item that started an hour ago and ends in an hour is still listed; one that ended ten minutes ago is gone → AC-5, AC-6
- [ ] An event and an activity set to the same start minute come back in the same order on every reload, with the event first → AC-5
- [ ] With nothing upcoming at all, the screen shows one empty state rather than a bare header → AC-5
- [ ] Signed in as the visitor → only church events appear, no activities, and no tag reads as a group → AC-3, AC-5
- [ ] Cancel a seeded activity (set `cancelledAt` and a reason) → it keeps its place in date order, marked cancelled in crimson, with the reason visible → AC-6
- [ ] Set a future event's cancellation fields → same treatment → AC-6, AC-12
- [ ] Archive a future event (`active: false`) → it disappears entirely rather than reading as cancelled → AC-6
- [ ] A cancelled item whose date has passed is gone from the list → AC-6
- [ ] Screen reader over a cancelled row → the cancellation is announced, not conveyed by colour alone → AC-6

### Detail screen
- [ ] Tap an event → detail shows title, date, start AND end time, location, description and image → AC-7
- [ ] Tap an activity → the same screen shows the same fields for the activity → AC-7
- [ ] Open a cancelled one → the cancelled mark and its reason both show → AC-7
- [ ] Below the merged list → a this week's programs strip appears and opens the existing programs screen → AC-8
- [ ] Below that → spec 0005's past events grid is still present and still opens YouTube → AC-8

### Add to calendar
- [ ] On event detail, tap add to calendar for the first time → the system permission prompt appears → AC-9
- [ ] Grant it → the item lands in the phone's calendar at the right date, start and end time, with the location and title → AC-9
- [ ] The button now reads as added → AC-9
- [ ] Tap it again → no second calendar entry is created → AC-9
- [ ] Do the same from an activity's detail → one entry, same behaviour → AC-9
- [ ] Refuse the permission → a short plain explanation appears with a way into system settings, nothing is written, and the button is still usable → AC-10
- [ ] Grant permission from settings and tap again → it writes normally → AC-10
- [ ] On Android specifically → the entry lands in a real writable calendar, not silently nowhere (`getDefaultCalendarAsync` is iOS only) → AC-9
- [ ] The entry's time matches what the app displayed, for a device set to a zone other than Kampala → AC-9
- [ ] Delete the entry from the phone's calendar by hand, then reopen the screen → the button still reads as added (known limitation, the device note is not reconciled against the calendar) → AC-9
- [ ] Change a seeded event's start time in the dashboard after adding it → the calendar copy keeps the old time and the button still reads as added (known limitation, stated in Consequences; the push is what tells the member) → AC-9
- [ ] Tap add to calendar twice in quick succession → still one entry, because the device note is written before the confirmation → AC-9

### Deep links
- [ ] Trigger a notification carrying `deepLink.type: "activity"` → tapping it opens that activity's detail → AC-13
- [ ] Trigger one carrying `deepLink.type: "groupMessage"` → tapping it opens the Updates tab → AC-13
- [ ] Trigger an `activity` link for an activity the signed in account is not eligible for → the screen shows the no longer available state, names nothing about the activity, and does not crash → AC-13, AC-3
- [ ] An older notification carrying the previous `/event-detail?id=` route still opens the right item → AC-7, AC-13
- [ ] Dispatch a notification with a `clan` audience from the dashboard → only verified members of that clan receive it, and nothing throws an unhandled audience error → AC-11, AC-15

## Automated

- [ ] `pnpm --filter @klt-cyber/shared test` → the horizon, the message window, the category union and the length caps are all covered → AC-1, AC-2, AC-5
- [ ] `pnpm exec tsc --noEmit -p convex/tsconfig.json` and the same for `apps/mobile` → clean
- [ ] `pnpm --filter mobile lint` → clean
- [ ] Convex tests over `convex/lib/groupMembership.ts`: an active roster row grants a department whatever the profile status; a `clanId` grants a clan only when the profile is verified; a removed row grants nothing → AC-3
- [ ] Convex test: `listMyGroupMessages` excludes a `deletedAt` row and a row outside the 90 day window → AC-2, AC-4
- [ ] Convex test: `listUpcomingForMember` returns nothing beyond the horizon, keeps a row that started earlier today and is still running, drops one that has ended, stamps the right tag for each owner kind, and marks a cancelled row without dropping it → AC-5, AC-6
- [ ] Convex test: the tie break is deterministic, so a `limit` of 1 over an event and an activity sharing a start minute always returns the event → AC-5
- [ ] Convex test: the membership helper dedupes repeated department rows and returns no clan for an unverified profile → AC-2, AC-3
- [ ] Convex test: `resolveClanAudience` returns verified clan members only, and `resolveAudience` still type checks with its exhaustive `never` branch → AC-11

## Known not verifiable yet

- [ ] **No authoring path exists.** AC-2, AC-3 and AC-5 are proved against seeded rows, not against a message or activity a human created in the portal. Re-verify by hand once feature 17 ships the department Messages and Activities pages, and again at feature 23 for clans and feature 18 for the event cancel action → AC-11, AC-12
- [ ] Push audiences are out of scope here and unchanged. F4-17's and N27's verified only rule is feature 17's and feature 23's to verify when they send → AC-15

## Corrections from the build · added by /develop 2026-10-23

Every step above still stands except where noted here. These are things the
build settled or found impossible, not changes of mind.

### Before you start

- [ ] The preview APK matters more than it looks. `expo-calendar` is a native
      module, so the whole **Add to calendar** section above cannot be reached
      from the current dev client or from an over the air update. Run the manual
      "Build (preview APK)" workflow first, install that build, and verify that
      section on it. Everything else can be verified over the air.
- [ ] The schema and functions are live on the **dev** deployment only, and
      `contentSeed:seedGroupSamples` has already been run there. Staging has
      neither. On dev, re-running the seed correctly refuses with
      `already seeded (group activities exist)`, so the Preconditions steps
      above will read as refusals rather than fresh writes.

### The category set is fixed at three

- [ ] `ANNOUNCEMENT_CATEGORIES` is `general`, `event`, `program`, fixed from a
      read of the dev deployment, where those are the only three values any row
      holds. Staging and production were **not** read. So the step above about
      an off-set value is still worth doing, and is the one that would catch a
      value only those deployments hold. It stays cosmetic either way: an
      unknown value renders as a plain neutral chip showing the stored word.
- [ ] One extra step for the portal: open an announcement whose category is
      off-set and press save without touching the category. It should refuse
      with `"<value>" is no longer a category. Choose one from the list.` rather
      than silently sending the stale value → AC-16
- [ ] And one for clearing: choose **No category** on an announcement that has
      one, save, and confirm the chip disappears in the app. The form sends an
      empty category rather than omitting it, which is how the server is told to
      clear rather than to leave the value alone → AC-16

### One seeded row could not be created

- [ ] **Replace** the step "the seeded rows include ... a message older than 90
      days". The seed cannot plant one. `groupMessages` deliberately has no
      `sentAt` (the window compares against `_creationTime`), and Convex assigns
      `_creationTime` itself, so a seed has no way to backdate a row. Verify the
      window from the automated side instead, with a faked clock:
      the `listMyGroupMessages` Convex test in the Automated section covers it
      → AC-2, AC-14
- [ ] The other three edge rows AC-14 asks for were all seeded and are present:
      a cancelled activity with a reason, an activity 70 days out (past the 8
      week horizon), and an event carrying `cancelledAt`/`cancelledBy`/
      `cancellationReason` → AC-14

### What the seed actually planted on dev

Useful when reading the screens, since no portal page writes any of this yet.

- [ ] Three departments carry content, not two: **Administration** and
      **Pastoral** have both messages and activities, and **Finance** has an
      activity and deliberately **no messages at all**. Finance is what proves
      the "a group with nothing to say shows no heading" step above → AC-2
- [ ] The clan is **Reuben**, with two messages and one activity.
- [ ] One activity is already running (it started an hour before the seed ran
      and ends an hour after), which is the row that proves a listing leaves on
      its end time rather than its start → AC-5
- [ ] Rosters and clans are attached by profile status rather than by email: a
      **verified** profile gets all three departments plus the clan, a
      **pending** one gets Administration plus the clan, and an account with no
      profile gets nothing. So the three test accounts come out in the right
      shape whoever they are on this deployment, and re-running the seed cannot
      double a roster row or move anyone's real clan.

### Two things the spec's API table assumed

- [ ] `events.getEvent` did not exist and was written as part of this build.
      Before it, both detail screens found their row inside a list query, so
      anything outside the upcoming window could not open at all. Worth one
      extra step: open an event whose date has passed from a notification and
      confirm the detail screen renders rather than saying not found → AC-7
- [ ] A new index, `memberProfiles.by_clanId_profileStatus`, was added so the
      `clan` push audience filters to verified members inside the index read
      rather than in memory. The spec's data model section did not list it. The
      `resolveClanAudience` step above is unchanged and still the thing to check
      → AC-11
