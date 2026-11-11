# 0019. Radio core: live stream, status, schedule, listening records and recordings

**Date**: 2026-11-11
**Status**: In Progress

## Summary

The Radio tab stops pretending. Today it shows a hardcoded count of 47 listeners, a fake chat and a notes box, and reads its schedule from a file bundled inside the app. This spec replaces all of that with the real thing: the live Caster FM stream playing with the screen locked, a Live, Off air or Stream interrupted status worked out automatically from the stream itself, a broadcast schedule Media runs from the portal, listening time recorded per person per broadcast, programs a member can follow for a push when one goes live, recordings uploaded to storage in resumable chunks, and a prayer request or testimony reaching the Radio inbox.

It also opens Media's portal to its roster members for the radio pages only, through a new department scoped permission called `manageRadio`, and gives Media a dashboard where its portal index currently just redirects. The data model here is the one SRS 4.4 says must exist before the clan portal's Super T (feature 23) and Radio Insights (feature 32) can be built, so the shapes chosen here are a contract those two features inherit.

## Requirements

**User stories**

- As a member, I want to play Reign Radio from the Radio tab and keep hearing it when I lock my phone, so that I can listen while I do something else.
- As a member, I want to know whether the radio is on air right now, what is playing and what is next, so that I am never guessing.
- As a member, I want my listening time counted and the programs I care about to tell me when they start, so that I do not miss them.
- As a member or visitor, I want to send an anonymous prayer request or a named testimony while a broadcast is on, so that the people on air can pray with me.
- As Media, I want to run the broadcast schedule, force the status when I know better, see who is listening and upload recordings, so that the app tells the truth about our broadcasts.
- As a Media roster member, I want to reach the radio pages without holding an appointment, so that the team that runs broadcasts can actually run them.

**Acceptance criteria**

- **AC-1**: The Radio tab plays the live stream from Caster FM. The hardcoded listener count, the placeholder comment list, the notes box and `apps/mobile/data/programs.ts` are all gone, and no screen in the app reads bundled program data any more. (R1-01, NF-18)
- **AC-2**: Audio keeps playing when the app is backgrounded or the phone is locked, for at least ten unbroken minutes on a real Android device and on iOS, with lock screen and notification controls showing the program name, the host and artwork, marked as a live stream. (R1-02, NF-09)
- **AC-3**: The player shows exactly one of Live, Off air or Stream interrupted, derived from the status row and the clock the reader holds. Interrupted shows when the last probe found no source and the stream was last seen live within the previous five minutes; otherwise no source reads as Off air. The derivation takes `now` as a parameter so it can be tested at any point on that timeline. (R1-04)
- **AC-4**: The play button is enabled in every status. Tapping it while the status is not Live attempts playback anyway; if no audio has arrived within eight seconds it shows "Nothing on air right now" and returns to rest without an error screen. (R1-01, NF-06)
- **AC-5**: Detection runs without anyone watching. A cron every minute probes the stream, and while the status is Live or a broadcast window is open that same cron run also schedules two more probes, at twenty and forty seconds. No probe schedules another probe, so a probe that throws costs one reading and never stops the loop. Each probe records what it found and when. (R1-04, R2-06)
- **AC-6**: A `manageRadio` holder forces Live or Off air and returns to automatic. The override changes only what readers are shown: it wins over the derived status, and it never opens a broadcast, never fires a follow push and never changes what listening attaches to, all of which key on the probe's own finding. It survives until a person clears it, shows a banner naming who set it and when on both the Radio page and the dashboard live status card, and writes an `activityLogs` row when set and when cleared. Interrupted can never be forced. (R2-05, NF-05)
- **AC-7**: The Now segment shows the program on air and its host, and what is next with a countdown that ticks, all in Kampala time. The phone decides which broadcast is current from the schedule it already holds and its own clock, so the rollover at a start time does not wait for a server write. (R1-03, NF-11)
- **AC-8**: The Schedule segment lists the next seven days from now, grouped under day headings in Kampala time, each row showing the start time, the program, its length and a follow toggle. A broadcast that crosses midnight appears under the day it starts, and one that started yesterday and is still running is included. (R1-05, NF-11)
- **AC-9**: A member follows or unfollows a program from a schedule row or from the Followed radio programs screen reached from My Profile, and both surfaces show the same state without a refresh. (R1-07, M6-05)
- **AC-10**: A program's default follow state is the `followedByDefault` field on its own row, which the seed sets true for English Service, Luganda Service and Midweek Service and false for everything else, Super T included. No surface hardcodes that list. (R1-07)
- **AC-11**: N33 reaches a program's followers as push, at most once per broadcast. It is sent by the same mutation that records the probe finding the source, which tests and sets `livePushSentAt` in that one transaction, so two probes cannot both send. It fires only inside the broadcast's window, which begins fifteen minutes before `startsAt` so a soundcheck does not consume it. A broadcast that is never live sends nothing, a stream that drops and returns sends nothing further, a cancelled broadcast sends nothing, and an overridden status sends nothing. Once feature 28 stores mute choices, a member who muted the radio category is excluded. (R1-07, N33, F4-19)
- **AC-12**: While audio is actually playing, the app beats every thirty seconds, naming only its device. The server resolves which broadcast the beat falls in and keeps one open listening stretch per user, device and broadcast, holding the start, the last beat and the seconds. A beat credits `min(now - lastBeatAt, 45s)`, the first beat of a stretch credits nothing, and a beat marked as stopping credits its final delta and closes the stretch. No figure is ever taken from the client's claim, and a stretch's seconds only ever increase. (R1-08)
- **AC-13**: A stretch whose last beat is more than ninety seconds old is closed by a sweep, crediting time only up to that last beat, so a phone that dies or is force quit accrues nothing further. A beat arriving after that sweep opens a new stretch rather than reviving the closed one, which the one open row rule allows, and a broadcast's total is the sum of every stretch against it. (R1-08)
- **AC-14**: Two devices signed in as the same person produce two stretches, and at most five devices per user per broadcast are accepted. Total hours add every stretch; a count of unique listeners counts that person once. (R1-08, RI1-02)
- **AC-15**: The in app listener figure is a number kept on the status row, recomputed by each probe as the distinct users whose last beat is inside the previous sixty seconds. No screen subscribes to the beats themselves. The member screen and the Media page both label it as in app listeners; the Media page additionally shows Caster FM's own whole stream figure, labelled as the whole stream. (R2-06, SRS 4.9.1)
- **AC-16**: When a listening stretch closes, its seconds are added to a counter keyed by city and Kampala day, once per stretch rather than once per beat. No city is stored on a listening stretch, and nothing in the counter can be traced to a person. (RI1-07, SRS 9)
- **AC-17**: When the probe finds a source and no scheduled or one off broadcast covers that moment, it opens a broadcast row of origin `auto`, titled from the stream's own display title when it offers one, with an end an hour out that each further live probe extends. The row closes only once the derived status reaches Off air, so a stream that drops and returns within the five minute grace keeps one row rather than gaining one per drop. No second auto row is ever opened while any broadcast covers now. Media can rename such a row or attach it to a program afterwards. (R1-08)
- **AC-18**: Media maintains the recurring programs on a Programs page: name, days, start time, length in minutes, host, description, image, record by default, followed by default and active. A name that matches another active program once trimmed and lowercased is refused by the mutation, not only hidden in the form. (R2-01)
- **AC-19**: Broadcast rows are written ahead nightly, at 21:30 UTC which is 00:30 in Kampala, up to the end of the Kampala day seven days out, for every active weekly program. The job only inserts rows that are missing, matched on program and start instant, so running it twice changes nothing. A program marked `occasional`, which is Holy Ghost Night, is never written ahead and takes airings only by hand. (R2-01)
- **AC-20**: Media adds a broadcast by hand in two ways: typing a one off name, which never becomes a recurring program, or choosing an existing program, which is how an occasional program gets an airing. A row added by hand is marked adjusted, so the nightly job leaves it alone. (R2-02, R2-01)
- **AC-21**: Media adjusts the times of, or cancels, a single broadcast. Members see the change, a cancelled broadcast stays visible marked Cancelled and is never treated as the current broadcast, its follow push does not fire, and the nightly job never rewrites a broadcast that was adjusted, cancelled or given a recording. Editing a program rewrites only its own future rows that nobody has touched, and deactivating a program deletes those same rows; no past row is ever moved or removed. (R2-03, R2-01)
- **AC-22**: A host is either a verified member chosen from a picker or a typed guest name, set on the program and overridable on one broadcast, where clearing both fields returns that broadcast to the program's host. Exactly one of the two is ever stored on the same record. (R2-04)
- **AC-23**: A seed creates the eight programs of R2-01 active, with those days, start times and lengths, including Super T at twenty four hours, and running it twice changes nothing. (R2-01, F5-03)
- **AC-24**: A program carries record by default and a broadcast inherits it, switchable for that one airing. Super T's flag is forced off, cannot be switched on anywhere, and the upload mutation refuses a recording aimed at a Super T broadcast. (RC1-01)
- **AC-25**: Media uploads a recording to a finished broadcast in parts of 8 MiB, at most 500 MB and `audio/*` only, and the server refuses any object key outside `radio/recordings/<broadcastId>/`. An upload interrupted partway resumes from the last completed part, found by asking storage which parts it already holds, with the upload's id kept in the browser against that broadcast, file name and size. The form shows the recommended export setting (spoken word, about 30 MB an hour). (RC1-02, NF-07)
- **AC-26**: Uploading over an existing recording is an explicit replacement, not an error, and replacing or removing one schedules the old stored object for deletion and writes an `activityLogs` row. Nothing expires on its own. (RC1-03, NF-05)
- **AC-27**: A recording appears in the mobile Recordings segment as soon as it is uploaded: newest upload first, filterable by program, twenty at a time, each row showing the program, the broadcast's date and the length read from the file at upload time. Playback urls are signed for an hour and re derived from the stored key, never stored. (RC1-04, R1-06, NF-07)
- **AC-28**: While a broadcast is on air, any signed in user, visitor or member alike, sends an anonymous prayer request or a named testimony from the Now segment. Off air both buttons are disabled with a sentence saying why. A body over 1000 characters is refused, and prayer requests and testimonies share one budget of five submissions per person in any rolling hour. (R1-09)
- **AC-29**: Every item stores its sender privately and the broadcast it arrived during. The inbox read groups items by broadcast, newest broadcast first, shows a testimony's sender name and never shows a prayer request's sender to anybody, in any surface or payload, including the response to marking one prayed for. (R1-09, PS2-01, PS2-02, PS2-03, NF-02)
- **AC-30**: An inbox notice reaches the Pastoral HOD and delegates by push and web bell, at most once per broadcast per hour, worded as a count, and it cannot be switched off. An hourly job sends it from a watermark held on the broadcast, so a repeated run does not send twice. (N34, F4-19)
- **AC-31**: A `manageRadio` holder marks a prayer request as prayed for, and the mark is visible to Pastoral. The notice back to the sender is feature 19's work, not this one's. (PS2-05)
- **AC-32**: `manageRadio` is held by the Media HOD, Media delegates, verified Media roster members and a System Admin, and by nobody in any other department. A verified Media roster member reaches the portal, sees Radio, Programs, Recordings, Radio inbox and the dashboard, and does not see Devotionals or Past events. (SRS 4.9.2, SRS 3.3, F3-19)
- **AC-33**: Every radio query that reveals management data and every radio mutation re checks its capability on the server. A roster member of another department, a Media roster member whose profile is not verified, and an unauthenticated caller are each refused. (NF-01)
- **AC-34**: `/areas-of-service/media` renders a dashboard instead of redirecting to Devotionals, carrying three cards: live status with the override banner when one is set, the last finished broadcast that was not cancelled and had at least one listener with its unique listeners and hours, and a warning when tomorrow's Kampala date has no devotional. A card with nothing to report shows an empty state rather than zeros. (SRS 4.9.3, D1-02, N45)
- **AC-35**: Home shows a Live now card only while the status is Live, and tapping it opens the Radio tab. Off air and Interrupted both hide it. (M2-04)
- **AC-36**: Deleting an account deletes that person's follow choices and their inbox items, whose text can name them, and leaves their listening stretches pointing at the user row the existing deletion already anonymises, so past broadcast figures stay true while nothing identifies the person. (NF-04, spec 0008)
- **AC-37**: Every new screen and card shows a friendly retry on failure and an empty state when there is nothing to show. No blank page and no crash. (NF-06)
- **AC-38**: The Pastoral HOD and delegates read the inbox under the same sender rules as Media, so the one query serves both departments and feature 19 builds its page on it rather than reopening it. Marking a testimony read on air (PS2-04) and hiding an item (PS2-06) are deliberately not built here and belong to feature 19. (PS2-03, SRS 4.9.2)
- **AC-39**: A probe that cannot reach the stream at all records the failure and leaves the last finding in place rather than inventing one, and a status whose last probe is more than three minutes old reads Off air however it last read, so a stalled cron can never leave the app saying Live. The failure reaches Sentry once per outage, not once per probe. (R1-04, NF-06, NF-13)

## Decision

**Chosen option**: Option 2: materialised broadcasts with a polled stream status, built on the stack already in the repository.

Build Radio core entirely on what the project already runs (Convex functions and crons, `expo-audio`, the existing R2 gateway, the existing push plumbing), with broadcasts written ahead as real rows, the status derived from polling Caster FM's public statistics endpoint with a manual override on top, and listening recorded as heartbeat extended stretches.

**Implementation skills**: `convex` (`.claude/skills/convex/`) · `convex-reviewer` (`.claude/skills/convex-reviewer/`) · `shadcn` (`.claude/skills/shadcn/`) · `mobile-frontend-design` (`~/.claude/skills/mobile-frontend-design/`) · `cloudflare-r2` (`secondsky/claude-skills`, `.agents/skills/cloudflare-r2/`) · `nextjs-on-cloudflare` (`~/.claude/skills/nextjs-on-cloudflare/`)

Read `cloudflare-r2` for part size limits only (parts of at least 5 MB, at most 10,000 of them). Its code examples use the Workers R2 binding, which this build does not use, so do not follow its API shapes.

## Rationale

Reasoning, the options weighed and the sources: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

All seven tables are new. Nothing existing changes shape, so the schema change is additive and safe against live staging data.

| Table | Fields | Notes |
|---|---|---|
| `radioPrograms` | `name` (req), `nameKey` (req, trimmed and lowercased, for the duplicate check), `seedKey` (opt), `description` (req), `days` (req, array of 0 to 6, Sunday is 0), `startTime` (req, `"HH:MM"` Kampala), `durationMinutes` (req), `recurrence` (req, `"weekly" \| "occasional"`), `recordByDefault` (req), `followedByDefault` (req), `isActive` (req), `imageKey` (opt, R2 key), `hostUserId` (opt) xor `hostGuestName` (opt), `createdBy`, `updatedBy`, `updatedAt` | A length in minutes rather than an end time, because Super T runs a full 1440 and an end equal to the start cannot say so. Crossing midnight falls out of the arithmetic. Indexes: `by_isActive`, `by_seedKey`, `by_nameKey` |
| `radioBroadcasts` | `programId` (opt) xor `oneOffName` (opt), `origin` (req, `"scheduled" \| "oneOff" \| "auto"`), `startsAt`/`endsAt` (req, unix ms), `hostUserId` (opt), `hostGuestName` (opt), `isRecorded` (req), `status` (req, `"scheduled" \| "cancelled"`), `adjusted` (req), `cancelledAt`/`cancelledBy` (opt), `wentLiveAt` (opt), `livePushSentAt` (opt), `lastDigestAt` (opt), `recording` (opt object: `key`, `durationSeconds` opt, `sizeBytes`, `uploadedBy`, `uploadedAt`), `recordingUploadedAt` (opt, a mirror of the embedded value so it can be indexed; every write path sets both) | One airing. On air and finished are read from the clock, never stored. An `auto` row's `endsAt` is extended by each live probe. Indexes: `by_startsAt`, `by_programId_startsAt`, `by_status_startsAt`, `by_recordingUploadedAt`, `by_programId_recordingUploadedAt` |
| `radioStatus` | one row: `detected` (req, `"live" \| "off_air" \| "unknown"`), `lastLiveAt` (opt), `lastProbeAt` (req), `lastProbeOk` (req), `probeError` (opt), `inAppListeners` (req), `streamListeners` (opt), `streamTitle` (opt), `currentBroadcastId` (opt), `burstUntil` (opt), `override` (opt object: `state` `"live" \| "off_air"`, `byUserId`, `setAt`) | Created lazily by the first probe; absent means Off air. `unknown` is a probe that could not reach the stream, which keeps the last finding rather than inventing one. Interrupted is derived, never stored and never forceable. Read with `.first()` |
| `radioProgramFollows` | `userId` (req), `programId` (req), `following` (req), `updatedAt` (req) | A row exists only where somebody chose. Indexes: `by_userId`, `by_userId_programId`, `by_programId_following` |
| `listeningSessions` | `userId` (req), `deviceId` (req), `broadcastId` (req), `startedAt` (req), `lastBeatAt` (req), `seconds` (req), `closedAt` (opt) | No location field at all, by design. Indexes: `by_broadcastId`, `by_userId_broadcastId`, `by_lastBeatAt`, `by_user_device_broadcast_open` |
| `listeningByCity` | `city` (req), `dateKey` (req, Kampala `YYYY-MM-DD`), `seconds` (req) | One row per city and day, and nothing else, so the key is unambiguous and the row is written once per closed stretch rather than once per beat. Holds no user reference of any kind. Index: `by_city_dateKey` |
| `radioInboxItems` | `type` (req, `"prayer_request" \| "testimony"`), `body` (req), `senderUserId` (req), `broadcastId` (req), `createdAt` (req), `prayedForAt`/`prayedForBy` (opt) | `senderUserId` is always stored and is returned to a client only for a testimony. Indexes: `by_broadcastId_createdAt`, `by_createdAt`, `by_senderUserId` (the rate limit and the deletion sweep) |

Relationships: a program has many broadcasts (`programId`, absent on a one off or an auto row) and many follows; a broadcast has many listening stretches and many inbox items, and at most one embedded recording; a user has many follows, many listening stretches (one open per device per broadcast) and many inbox items. `listeningByCity` relates to nothing, on purpose.

**State transitions**

Status, recorded by every probe and derived again on every read. The probe writes `lastProbeAt` on every run, which is what makes a subscribed client see a change, so a probe that writes nothing is a status that looks frozen:

```
          probe finds a source ──────────────► detected = live, lastLiveAt = now
probe finds no source ──────────────────────► detected = off_air
probe cannot reach the stream ──────────────► detected = unknown, last finding kept

derived for a reader, in this order:
  override set ...................... that state
  lastProbeAt older than 3 minutes .. off air
  detected live ..................... live
  no source, lastLiveAt < 5m ........ interrupted
  otherwise ......................... off air
```

Broadcast: `scheduled` (written ahead, added by hand, or opened by detection) → `cancelled` by Media, reversible by restoring, visible either way. Which broadcast is current, when rows overlap: a scheduled or one off row beats an `auto` row, the later `startsAt` beats the earlier, and a cancelled row is never current, so a live stream during a cancelled slot opens an `auto` row.

Listening stretch: open (beats arriving) → closed by a beat marked as stopping, by the beat that crosses the broadcast's `endsAt` (which credits the delta to the row the last beat fell in and opens a new stretch for the row covering now), or by the sweep ninety seconds after the last beat. A beat that falls in no broadcast at all credits nothing and opens nothing.

**API surface**

All Convex functions, except the one portal route. `manageRadio` means the capability check in `convex/lib/authz.ts`.

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `radio.getPlaybackConfig` | query | none | `streamUrl`, `cityLookupUrl` (omitted when `PORTAL_ORIGIN` is unset) | signed in | unauthenticated |
| `radio.getNowPlaying` | query | none | `status`, `override` summary, `current` broadcast with program and host, `next` with `startsAt`, `inAppListeners` | signed in | unauthenticated |
| `radio.listSchedule` | query | `fromAt` (opt) | seven days of broadcasts with program, host, length, `isFollowed`, `status`, including one still running from yesterday | signed in | unauthenticated |
| `radio.listRecordings` | query | `programId` (opt), `cursor` (opt) | a page of 20 ordered by `recordingUploadedAt` descending: date, program, `durationSeconds`, a one hour signed url | signed in | unauthenticated |
| `radio.getMediaRadioView` | query | none | status, override, `inAppListeners`, `streamListeners`, this week's broadcasts | `manageRadio` | not authorised |
| `radio.getMediaDashboard` | query | none | the live status card, the last broadcast card, the devotional warning card | `manageRadio` | not authorised |
| `radio.setOverride` | mutation | `state` (`live`/`off_air`) | the new status | `manageRadio` | not authorised |
| `radio.clearOverride` | mutation | none | the new status | `manageRadio` | not authorised, no override set |
| `radio.beat` | mutation | `deviceId`, `city` (opt), `stopped` (opt) | `secondsSoFar`, the resolved `broadcastId` or none | signed in | unauthenticated, more than five devices for this user and broadcast |
| `radioPrograms.list` | query | `includeInactive` (opt) | programs with the host resolved | `manageRadio` | not authorised |
| `radioPrograms.create` / `.update` | mutation | the program fields | `programId` | `manageRadio` | duplicate `nameKey` among active, invalid `"HH:MM"`, duration outside 1 to 1440, both host fields set, Super T record flag on |
| `radioPrograms.setActive` | mutation | `programId`, `isActive` | nothing | `manageRadio` | not authorised |
| `radioBroadcasts.createByHand` | mutation | `oneOffName` xor `programId`, `startsAt`, `endsAt`, host, `isRecorded` | `broadcastId` | `manageRadio` | end not after start, neither name nor program given |
| `radioBroadcasts.adjust` | mutation | `broadcastId`, times, host (null clears to the program's), `isRecorded` | nothing | `manageRadio` | a past broadcast that already has a recording, Super T record flag on |
| `radioBroadcasts.cancel` / `.restore` | mutation | `broadcastId` | nothing | `manageRadio` | not authorised |
| `radioBroadcasts.rename` | mutation | `broadcastId`, `oneOffName` or `programId` | nothing | `manageRadio` | the row is neither `auto` nor `oneOff` |
| `recordings.startUpload` | action | `broadcastId`, `sizeBytes`, `contentType`, `durationSeconds` (opt), `replace` (opt) | `uploadId`, `key`, `partSize`, the first batch of signed part urls | `manageRadio` | Super T broadcast, broadcast not finished, over 500 MB, not `audio/*`, a recording is there and `replace` was not set |
| `recordings.listParts` | action | `uploadId`, `key` | the part numbers and etags storage already holds | `manageRadio` | unknown `uploadId`, key outside this broadcast's prefix |
| `recordings.signParts` | action | `uploadId`, `key`, `partNumbers` | signed part urls | `manageRadio` | unknown `uploadId`, key outside this broadcast's prefix |
| `recordings.completeUpload` | action | `uploadId`, `key`, `parts` (number and etag), `broadcastId`, `durationSeconds` | nothing | `manageRadio` | etag mismatch, key outside this broadcast's prefix |
| `recordings.abortUpload` | action | `uploadId`, `key` | nothing | `manageRadio` | not authorised |
| `recordings.remove` | mutation | `broadcastId` | nothing | `manageRadio` | no recording there |
| `radioFollows.listMine` | query | none | every active program with its effective follow state | signed in | unauthenticated |
| `radioFollows.set` | mutation | `programId`, `following` | nothing | signed in | unauthenticated |
| `radioInbox.submit` | mutation | `type`, `body` | nothing | signed in | nothing on air, body over 1000, more than five in a rolling hour |
| `radioInbox.listByBroadcast` | query | `cursor` (opt, paging the broadcasts) | items grouped by broadcast, a sender name only on a testimony | `manageRadio` or Pastoral HOD or delegate | not authorised |
| `radioInbox.markPrayedFor` | mutation | `itemId` | nothing, and no sender in the response | `manageRadio` | not a prayer request |
| `radio.probeStream` | internal action | none | nothing (writes the status, sends N33, opens or extends an `auto` row) | internal | a fetch failure is recorded as `unknown`, never thrown |
| `radio.sweepListening` | internal mutation | none | nothing (closes stale stretches, adds their seconds to the city counter) | internal | none |
| `radio.materialiseBroadcasts` | internal mutation | none | nothing | internal | none |
| `radio.sendInboxDigest` | internal mutation | none | nothing | internal | none |
| `GET /api/where` | admin route handler | none | `{ city }`, or `{}` when no `cf` object is present | public, no auth | none that reach the caller |

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| `getPlaybackConfig` | the stream url the player opens | Convex env var `RADIO_STREAM_URL`, served through the query so it changes without an app release |
| `getPlaybackConfig` | the city lookup url the phone calls | Convex env var `PORTAL_ORIGIN` plus the fixed path `/api/where`, omitted when that variable is unset |
| `probeStream` | whether a source is connected | Caster FM `publicstats.json` at Convex env var `RADIO_STATUS_URL`: a `source` entry present means live. Where several mounts are returned, the one whose `listenurl` matches `RADIO_STREAM_URL`, else the first |
| `probeStream` | the fallback reading when the statistics request fails | a ranged request to `RADIO_STREAM_URL` with a five second timeout, aborted after the first bytes, counting as live only when the response carries an audio content type. Both failing is `unknown`, not off air |
| `probeStream` | the whole stream listener figure | `source.listeners` on that chosen mount |
| `probeStream` | the title used to name an `auto` broadcast | `source.display-title` on that mount, else the literal "Unscheduled broadcast" |
| `probeStream` | the stored in app listener figure | distinct `listeningSessions.userId` with `lastBeatAt` inside the last sixty seconds, counted during the probe and written to the status row |
| `getNowPlaying` | Live, Off air or Stream interrupted | derived in the order given under State transitions, from `override`, `lastProbeAt`, `detected` and `lastLiveAt` |
| `getNowPlaying`, `listSchedule` | the program and host of a broadcast | the row's `hostUserId` resolved through `users`, else its `hostGuestName`, else the program's own host, resolved the same way |
| the player and the schedule | which broadcast is current, and the countdown to the next | the phone, from the schedule it already holds and its own clock, using the overlap order under State transitions |
| `listSchedule` | day headings, and which day a crossing broadcast belongs to | `kampalaParts` and `kampalaDayStart` in `convex/calendar.ts`, applied to `startsAt` |
| `listSchedule` | each row's follow state | `radioProgramFollows.following` when a row exists, else `radioPrograms.followedByDefault` |
| `listSchedule` and the player hero | the program artwork | `radioPrograms.imageKey` resolved through the R2 gateway, else the bundled asset matched by `seedKey`, else `Church_Theme.jpg` |
| `beat` | the seconds credited | the server's own `Date.now()` against the stored `lastBeatAt`, as `min(delta, 45s)`, zero on a stretch's first beat |
| `beat` | the broadcast a stretch belongs to | resolved on the server from the beat's moment by the overlap order, never passed in by the client |
| `beat` | the city for the counter | the `city` the phone passes, which it got once per app session from `/api/where`, which read `request.cf.city` through `getCloudflareContext()`. Trimmed, and omitted when empty, which leaves the counter untouched |
| `beat` | the device a stretch belongs to | the `deviceId` the app already generates and stores for `userDevices` |
| `getNowPlaying`, `getMediaRadioView` | in app listeners | the number on the status row, written by the probe, so no reader subscribes to beats |
| `getMediaDashboard` | the last broadcast's unique listeners and hours | the most recent `radioBroadcasts` row with `endsAt` in the past, `status` not cancelled and at least one listening stretch, aggregated over those stretches |
| `getMediaDashboard` | whether tomorrow has a devotional | the existing `devotionals` table by tomorrow's Kampala date key, which has no draft state, so a row existing is the whole answer |
| `startUpload` | the recording's length | read in the browser from the file before the first part, passed in, stored on the broadcast. Display only, so the client's figure is accepted here where a listening figure would not be. Unreadable means no duration is shown |
| `startUpload` | the storage key | built by the action as `radio/recordings/<broadcastId>/<generated>`, and every later call checks that prefix |
| `listParts` | which parts a resumed upload already holds | storage itself, asked for the parts of that upload id, with the upload id kept in the browser against the broadcast, file name and size |
| `materialiseBroadcasts` | each generated `startsAt` and `endsAt` | `occurrenceInstant` in `convex/calendar.ts` for the start, from the program's `days` and `startTime`, plus `durationMinutes` for the end. One off times convert through the same helper |
| `materialiseBroadcasts` | whether a row already exists | the `by_programId_startsAt` index, matched on program and start instant |
| `sendInboxDigest` | the count in the notice | `radioInboxItems` created for that broadcast since its `lastDigestAt`, which the same mutation then advances |
| `sendInboxDigest`, N34 | the recipients | the active `roleAssignments` of `hod` and `department_admin` on the Pastoral department, resolved through the existing notification audience |
| the N33 push | the recipient list | every `radioProgramFollows` row with `following` true, plus, when the program is followed by default, every other user minus the rows with `following` false, minus anyone who muted the radio category once feature 28 stores that |
| `submit` | whether the rate limit is reached | `radioInboxItems` by `by_senderUserId` in the rolling hour before now, both types counted together |

**Key invariants**

- Exactly one of `hostUserId` and `hostGuestName` is set on a program, and on a broadcast neither being set means inherit.
- Exactly one of `programId` and `oneOffName` is set on a broadcast.
- No two active programs share a `nameKey`, checked in the mutation, since Convex has no unique index.
- At most one open `listeningSessions` row per user, device and broadcast, and at most five devices per user per broadcast.
- Super T never carries a recording, and its `recordByDefault` is false and unchangeable.
- A broadcast with `adjusted` true, `status` `cancelled`, or a recording attached is never touched by the nightly job, and no past row is ever touched by it.
- Only one `auto` row is ever open, and never while another broadcast covers now.
- `listeningSessions` carries no city, and `listeningByCity` carries no user reference.
- A prayer request's `senderUserId` never leaves the backend, in any payload, for any caller.
- `seconds` on a stretch only ever increases, and only by server computed amounts.
- `recording` and `recordingUploadedAt` are written together or not at all.
- A reader's status is derived from the status row and its own clock, and every probe writes `lastProbeAt` so a subscribed reader is told to look again.

**Security model**

The two permission dimensions stay apart, as `AGENTS.md` requires. Consumer access (playing, the schedule, recordings, follows, sending to the inbox) is gated on being signed in and nothing else, never on `users.role`, so a visitor gets the same radio as a member. Administrative access (the schedule, the override, recordings, the inbox, the dashboard) is gated on the new `manageRadio` capability, never on `users.role`, with the single inbox read also open to Pastoral's HOD and delegates because SRS PS2-03 gives both departments that view.

`manageRadio` is the third department scoped capability, beside `manageLibrary` and `manageRealEstate`. It is granted to every shell role of the Media department, the roster included, and to a System Admin, and is false everywhere else. The roster branch runs through `resolveDepartmentShellRole`, which already requires a verified member profile, so an unverified roster member is refused there rather than by a second rule. Media comes out of `LEADERS_ONLY_PORTAL_DEPARTMENTS` so a verified roster member can enter, while Devotionals and Past events keep their existing `requireMediaAuthority` gate, so nothing about publishing church wide content widens. All three portal layers apply (middleware, layout, Convex function), and the Convex check is the real boundary.

The sensitive data here is the prayer request sender link (stored, never returned), listening per person (returned only in aggregate; the named per clan view belongs to feature 23) and the city counters (aggregate by construction). No new regulated scope: no payment data, no health data, and no personal field the app does not already hold.

**Configuration required**

- `RADIO_STREAM_URL`: the Caster FM audio url the app plays and the probe falls back to. Convex env var, per deployment, a public value.
- `RADIO_STATUS_URL`: the full `publicstats.json` url including host and port, from the church's Caster FM dashboard. Convex env var, per deployment, public, no credentials.
- `PORTAL_ORIGIN`: the admin portal's origin, so the phone can be told where to ask for its city. Convex env var, per deployment.
- `apps/mobile/app.config.ts`: the `expo-audio` plugin with `enableBackgroundPlayback` true, which adds the Android foreground service permissions and the iOS background audio mode. A native change, so it ships in a build and never over the air.
- `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` promoted to direct root dependencies, used from a Node action (`"use node"`). Both are already in the tree as dependencies of `@convex-dev/r2`, which does not expose multipart uploads. They read the four R2 variables the deployment already holds (`R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), so there is no new secret.
- **Bucket prerequisites, before slice 7 can be tested**: CORS on the R2 bucket allowing `PUT` from the portal's origin with `ETag` in the exposed headers, since a part's etag is unreadable otherwise, and a lifecycle rule aborting incomplete multipart uploads after seven days so an abandoned upload does not pay rent. `spec/STORAGE.md` records production R2 and CORS as still outstanding, so this is a real prerequisite rather than a note.
- No new external service and no cost register entry: the city comes from Cloudflare's own `request.cf`, which the portal's Worker already receives free on every plan.

**Critical test scenarios**

- Happy path: a signed in member taps play during Morning Glory, hears the stream, locks the phone for ten minutes with the controls on the lock screen, and that broadcast's listening stretch holds ten minutes to within thirty seconds against their user and device, verifies **AC-1**, **AC-2**, **AC-12**.
- Status derivation, driven by a supplied `now`: no source with `lastLiveAt` four minutes ago reads Stream interrupted; six minutes ago reads Off air; an override of Live reads Live in both cases with the banner naming who set it; a `lastProbeAt` four minutes old reads Off air even with `detected` live, verifies **AC-3**, **AC-6**, **AC-39**.
- Failure case: the phone is force quit mid broadcast and no stop ever arrives, so the sweep closes the stretch at its last beat, the credited time stops growing, and those seconds reach the city counter once, verifies **AC-13**, **AC-16**.
- Failure case: a recording upload is interrupted after three of nine parts, and the retry asks storage which parts it holds and resumes at part four, verifying no part is uploaded twice, verifies **AC-25**.
- Failure case: the statistics host is unreachable for an hour. Each probe records `unknown` and keeps the last finding, the derived status falls to Off air once three minutes pass, Sentry receives one report rather than one per probe, and no screen shows a crash, verifies **AC-39**, **AC-37**.
- Refusal: an upload aimed at a Super T broadcast is refused by the mutation even when the request is made directly, as is a key outside that broadcast's prefix, verifies **AC-24**, **AC-25**.
- Refusal: the nightly job runs after Media moved Wednesday's Midweek Service by an hour, and that broadcast keeps its adjusted times, while a second run inserts nothing at all, verifies **AC-19**, **AC-21**.
- Auth: a verified Media roster member opens Radio, Programs, Recordings and the inbox and is refused on Devotionals; a Media roster member whose profile is not verified, a Library roster member and a signed out caller are refused every radio mutation; a Pastoral HOD reads the inbox and nothing else, verifies **AC-32**, **AC-33**, **AC-38**.
- Privacy: a prayer request is fetched by a `manageRadio` holder and by a Pastoral caller, and neither payload carries the sender's id or name, nor does the response to marking it prayed for, while a testimony's does, verifies **AC-29**.
- Privacy: an account is deleted, its follow rows and inbox items are gone, and its listening stretches still count toward past broadcast totals while naming nobody, verifies **AC-36**.
- Follow push: two members follow a program; the source appears during the soundcheck twenty minutes early and nothing is sent; the window's grace opens and the next probe sends exactly one push to each follower; the source drops and returns and nothing further is sent; two probes racing the same transition still send once, verifies **AC-11**.
- Concurrency: one listener's beat does not invalidate another listener's open screen, because the figure they both read is the number on the status row, verifies **AC-15**.

## Build plan

Tracer Bullet, from the scope header. Slice 4 threads the whole stack end to end (probe, status, player, override) so the riskiest part, background audio on a real device, is proven before anything is built on top of it. The schema for all seven tables lands once, in slice 3, because every table is new and additive, nothing has live data to migrate, and splitting an additive schema across slices would cost more than it buys.

1. Correct the source of truth first, as spec 0017 did: amend SRS 5 so N34's trigger is the hourly digest this feature builds rather than "outside broadcasts", amend F3-19 so Media's roster exclusion reads as the radio pages only, and record in SRS 4.12.4 that PS2-04 and PS2-06 belong to feature 19, satisfies **AC-30**, **AC-32**, **AC-38**
2. Shared contracts in `packages/shared`: the program and broadcast validators, the status union, the body and rate caps, the upload limits, the eight seeded program definitions with their `seedKey`, `durationMinutes` and `followedByDefault` values, and the schedule helpers, with Vitest cover on the recurrence, the crossing midnight and the Super T full day cases, satisfies **AC-10**, **AC-19**, **AC-23**, **AC-28**
3. The full schema (all seven tables and their indexes) plus `manageRadio` in `convex/lib/authz.ts`, Media out of `LEADERS_ONLY_PORTAL_DEPARTMENTS`, and the `DEPARTMENT_SCOPED_CAPABILITIES` entry, satisfies **AC-32**, **AC-33**
4. The tracer bullet, status and player end to end: `radio.probeStream` against `publicstats.json` with the guarded byte fallback and the `unknown` reading, the minute cron with its two scheduled follow up probes, the stale probe rule, the derivation order, `getNowPlaying` and `getPlaybackConfig`, the `auto` row opener and extender, the mobile hero with `expo-audio` background playback and lock screen controls, the `app.config.ts` plugin change, and the Media status bar with override set and clear plus its `activityLogs` rows, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-17**, **AC-39**
5. Programs and the schedule: the program functions with the `nameKey`, duration and host refusals, the nightly materialisation with its insert only and hands off rules, by hand broadcasts for both a typed name and an existing program, adjust, cancel, restore and rename, the Media Programs page and the Radio page's week, the mobile Schedule segment with its client side current and next, and the seed, satisfies **AC-7**, **AC-8**, **AC-18**, **AC-19**, **AC-20**, **AC-21**, **AC-22**, **AC-23**
6. Listening and the counts: `radio.beat` with server side broadcast resolution and the capped credit, the split at `endsAt`, the device cap, the sweep writing the city counter on close, the probe's stored listener figure, the `/api/where` route handler reading `request.cf.city`, and both figures on the Media page, satisfies **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-16**
7. Follows and the live push: the follow functions resolving the default from the program row, the schedule row toggles, the `radio-follows.tsx` screen and its row on the profile screen, and the N33 send inside the probe's own transaction with its grace window and its once per broadcast marker, satisfies **AC-9**, **AC-10**, **AC-11**
8. Recordings: the multipart actions over `@aws-sdk/client-s3` in a Node action (start, list parts, sign, complete, abort) with the prefix, size and type checks, the Media Recordings page with real resume and the export hint, explicit replacement, remove with the R2 cleanup and the log rows, the Super T refusal, and the mobile Recordings segment with its filter, paging and signed urls, satisfies **AC-24**, **AC-25**, **AC-26**, **AC-27**
9. The Radio inbox: the submit mutation with its on air, length and shared rolling hour refusals, the mobile send forms, the grouped read serving both Media and Pastoral with the sender rules, the mark prayed for action, and the hourly digest with its per broadcast watermark, satisfies **AC-28**, **AC-29**, **AC-30**, **AC-31**, **AC-38**
10. The surfaces that hang off everything else: the Media dashboard with its three cards replacing the redirect, Home's Live now card off `getNowPlaying`, the account deletion sweep over follows and inbox items, and the empty and error states across every new surface, satisfies **AC-34**, **AC-35**, **AC-36**, **AC-37**
11. The Convex test suite over the authority matrix including Pastoral's read, the status derivation table with a supplied `now`, the materialisation insert only and hands off rules, the Super T and prefix refusals, the beat and sweep arithmetic, and the sender privacy rule, satisfies **AC-3**, **AC-12**, **AC-13**, **AC-19**, **AC-21**, **AC-24**, **AC-25**, **AC-29**, **AC-33**, **AC-38**, **AC-39**

## Consequences

**Positive**

- The Radio tab stops showing invented data, which is the most visible breach of NF-18 in the app today.
- Feature 23 (Super T) and feature 32 (Radio Insights) get the data model SRS 4.4 says they need, with listening stretches carrying real timestamps so gate level attribution is derivable later without a backfill.
- `manageRadio` proves the department scoped capability pattern a third time, and the first time on a bespoke portal rather than the shared shell, which is the shape Hospitality will want next.
- City totals accrue from day one at no cost and with no third party, because the portal is already a Cloudflare Worker.
- No new external service, no new secret and nothing new for the cost register.
- No screen subscribes to the listening beats, so a crowd arriving at once costs writes rather than a fan out of invalidations across every open screen.

**Negative and tradeoffs**

- A forced status has no expiry. Somebody who forces Live and closes the tab leaves every member being told the radio is on air. The banner and the dashboard card are the only guards, and they only help a person who looks. This was chosen deliberately over an automatic lapse.
- A prayer request cannot be sent off air at all. The person most likely to need one at 2AM on a Thursday is told to come back later, and N34's SRS wording had to be corrected because the state it describes can no longer occur.
- The status a member sees can be up to a minute behind during a quiet hour, and up to twenty seconds behind during a broadcast, because it moves only when a probe writes.
- The seven day horizon means the Media page cannot show a month, and a one off scheduled three weeks out sits alone with nothing around it.
- Background audio is a native configuration change, so this feature cannot reach a phone over the air. It needs a build, and the Android three minute rule makes the lock screen call load bearing rather than cosmetic.
- Multipart upload is the most unfamiliar code in the build and the R2 component does not provide it, so the project takes on direct use of the AWS S3 client, its own part bookkeeping and a bucket CORS and lifecycle configuration that does not exist yet in production.
- Seeding the eight programs active means a wrong seeded time is live in production the moment the feature ships, rather than waiting behind a draft flag.
- The mobile app now calls the admin portal for its city, which couples two surfaces that were independent. A portal outage costs city data and nothing more.
- The Media dashboard is bespoke, so it does not answer the question spec 0018 is blocked on (where Real Estate's three cards live now that the shared shell's extras slot is gone). That decision is still owed.

**Neutral**

- Nine Convex crons exist after this (five today, plus the status probe, the listening sweep, the nightly materialisation and the hourly digest), all offset off the hour as `convex/crons.ts` already does, with the two faster probes being scheduled runs rather than crons of their own.
- The bundled program images stay in the repository as the `seedKey` fallback, even though `data/programs.ts` goes.
- A roster member entering Media's portal lands on the new dashboard rather than Devotionals, which is a change for today's Media leaders too.
- Three SRS lines are amended by this feature's first build task, which is the same pattern spec 0017 used.

## Follow-up

- [ ] `AGENTS.md` tells agents to load the `klt-cyber-brand` and `klt-cyber-web-ui` skills, and neither is installed in this repository or in the user skills directory. Either install them or correct the instruction. `AGENTS.md` also has no `## Agent skills` section, so installed skills are not discoverable from it.
- [ ] Record for `AGENTS.md`: `cloudflare-r2` (`.agents/skills/cloudflare-r2/`) installed for this feature. Declined: the `expo-audio` community skills, the ipinfo based geolocation skills and servers, and Expo's official MCP server at `https://mcp.expo.dev/mcp`.
- [ ] `expo-audio` is the fallback risk in this build. If its lock screen behaviour disappoints on a real device, `react-native-track-player` is the alternative, at the cost of a new native dependency whose Expo posture the landscape check found weak.
- [ ] Verify `request.cf.city` is readable through `getCloudflareContext()` in a deployed preview before slice 6 relies on it. The check confirmed `request.cf` for Workers generally, not for this adapter, and local development has no `cf` object at all. The route already answers `{}` when it is absent, so a failure costs city data and nothing else.
- [ ] Provision production R2 and the bucket CORS and lifecycle rules that slice 8 needs. `spec/STORAGE.md` records both as outstanding.
- [ ] The named per clan listening view (F3-15) and gate level attribution are deliberately not built here. Feature 23 reads these tables.
- [ ] Confirm the exact Caster FM host and port for `RADIO_STATUS_URL` from the church's dashboard, and watch the first real Super T: a 24 hour broadcast whose source drops repeatedly exercises the interrupted grace and the auto row rules harder than anything else in the schedule.
- [ ] If this spec grows again during the build, promote it to an umbrella with a child per surface rather than letting one file sprawl further.
