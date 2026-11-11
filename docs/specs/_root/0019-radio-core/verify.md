# Verify: Radio core · spec 0019 · updated 2026-11-11
_Steps derived from spec 0019 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Covers every build slice, 1 to 11._

## Setup (once per deployment)
- [ ] `pnpm exec convex env set RADIO_STREAM_URL "<Caster FM audio url>"` and `RADIO_STATUS_URL "<publicstats.json url with host and port>"` on the deployment under test → the Radio page stops showing the "stream is not connected" banner
- [ ] Build an app with the native change (`app.config.ts` adds the iOS `audio` background mode); an over the air update will not carry it

## UI / manual
- [ ] Open the Radio tab → no fake listener count, no comments, no notes box, no bundled schedule → AC-1
- [ ] Off air, tap play → a spinner, then within about 8 seconds "Nothing on air right now" and the button returns to play, no error screen → AC-4
- [ ] While the source is live, tap play → audio within a few seconds and the status pill reads LIVE → AC-1, AC-3
- [ ] Lock the phone for ten unbroken minutes on a real Android device, then on iOS → audio never stops; the lock screen and notification show the program name, the host and artwork, with no seek buttons → AC-2
- [ ] Pause from the lock screen → the app's button returns to play → AC-2
- [ ] Leave the Radio tab while playing → audio keeps playing → AC-2
- [ ] Stop the source on Caster FM → within about 20 seconds the pill reads STREAM INTERRUPTED; about five minutes after the last live reading it reads OFF AIR → AC-3
- [ ] With a broadcast next, the Up next card counts down every second in Kampala time; at its start time the hero switches to it without a pull to refresh → AC-7
- [ ] As a verified Media roster member, open the portal → the hub links Media, the portal opens on Radio, the sidebar shows Radio and hides Devotionals and Past events; typing `/areas-of-service/media/devotionals` lands back on Radio → AC-32
- [ ] As a Media roster member whose profile is not verified, and as a Library roster member → no Media link on the hub, and the Radio url does not open → AC-32, AC-33
- [ ] On the Radio page, Force Live while off air → members see LIVE, the page shows "Forced Live by <name> at <time>"; no new broadcast row appears and nothing is sent → AC-6
- [ ] Return to automatic → the status follows the stream again; `activityLogs` holds `radio.override_set` and `radio.override_cleared` rows → AC-6
- [ ] With the status forced Off air, the Force Off air button is disabled and there is no Interrupted option anywhere → AC-6
- [ ] The Radio page shows "In app listeners" and "Whole stream" as separate, labelled figures → AC-15

## Commands
- [ ] `pnpm --filter @klt-cyber/shared test` → passes, including `radio.test.ts` (status table, Kampala occurrences, crossing midnight, Super T full day) → AC-3, AC-19, AC-23
- [ ] `pnpm run test:convex` → passes, including `radio.test.ts` (probe write rules, auto rows) and the `manageRadio` cases in `departmentShell.test.ts` → AC-5, AC-17, AC-32, AC-33, AC-39
- [ ] `pnpm exec convex data radioStatus` a minute after deploying → `lastProbeAt` within the last minute; with the stream unset it reads `unknown` with a reason → AC-5, AC-39
- [ ] Point `RADIO_STATUS_URL` at a host that does not answer for ten minutes → one Sentry issue, not ten; members read OFF AIR after three minutes → AC-39

## Value sourcing
- [ ] Change `RADIO_STREAM_URL` with `convex env set` while the app is open → the next play uses the new url with no app release (`getPlaybackConfig`)
- [ ] With two mounts in `publicstats.json`, the probe reads the one whose `listenurl` matches `RADIO_STREAM_URL` (`probeStream`, mount choice)
- [ ] Make `publicstats.json` fail while the stream plays → the byte fallback reads live; stop the stream too → `unknown`, not `off_air` (`probeStream`, fallback)
- [ ] Live with no broadcast scheduled → an `auto` row named from the stream's display title, else "Unscheduled broadcast" (`probeStream`, auto title)
- [ ] Set the phone to a different timezone → the hero times, the Up next time and the countdown still read Kampala time (`formatKampalaTime`, AC-7, NF-11)
- [ ] Stop the cron (or let the probe go stale for over three minutes) while the row last read live → the phone shows OFF AIR on its own clock (derivation on the reader's clock, AC-39)

## Slice 5: programs and the schedule

### Setup
- [ ] `pnpm exec convex run seed:radioPrograms` on the deployment under test → `{ created: 8, ... }` the first time, `{ created: 0, broadcastsWritten: 0 }` the second → AC-23

### UI / manual
- [ ] Media portal → Programs → eight seeded programs, all active, Super T at 24h marked "Never recorded" → AC-23, AC-24
- [ ] Add a program named " morning glory " (spaces, lowercase) → refused with "Another active program already has that name" → AC-18
- [ ] Deactivate Morning Glory, then add "Morning Glory" again → accepted; reactivating the old one is now refused for the same reason → AC-18
- [ ] Add a weekly program for tomorrow → its airing shows on the Radio page week and the phone's Schedule straight away, without waiting for the nightly job → AC-18, AC-19
- [ ] Edit Super T → its record switch is off and disabled; forcing `recordByDefault: true` through the Convex dashboard call is refused → AC-24
- [ ] Set a program host to a member, then type a guest name → the guest box is disabled while a member is chosen; only one is ever saved → AC-22
- [ ] On a single airing, set a guest host, then clear it → the row shows the program's host again, marked "(program host)" → AC-22
- [ ] Add a broadcast by hand with a typed name → appears marked "One off"; add one choosing Holy Ghost Night → appears as Holy Ghost Night (the only way it ever airs) → AC-20
- [ ] Move Wednesday's Midweek Service from 4:00 PM to 5:00 PM, then run `pnpm exec convex run radio:materialiseBroadcasts` twice → the airing stays at 5:00 PM, no second 4:00 PM row appears, both runs report `inserted: 0` → AC-19, AC-21
- [ ] Cancel an airing → it stays on the week struck through and marked Cancelled, the phone shows it as CANCELLED and never as on now; Restore brings it back → AC-21
- [ ] Change Morning Glory's start time to 7:00 AM → its untouched future airings move to 7:00, while one you adjusted or cancelled earlier stays as it was, and nothing in the past moves → AC-21
- [ ] Deactivate a program → its untouched future airings disappear; adjusted, cancelled and past ones stay → AC-21
- [ ] An unscheduled (`auto`) row on the week → Adjust lets you rename it or attach it to a program; a scheduled row offers no rename → AC-17
- [ ] Phone → Radio → Schedule → the next seven days grouped under Today, Tomorrow, then weekday headings; each row shows the start time, program, length and host → AC-8
- [ ] Tongues of Fire (Friday 11:00 PM, 3h) sits under Friday, not Saturday; viewed at 1:00 AM Saturday it is still listed, marked ON NOW → AC-8
- [ ] Leave Schedule open across a start time → the ON NOW marker moves to the new broadcast without a refresh → AC-7

### Commands
- [ ] `pnpm run test:convex` → passes, including `radioSchedule.test.ts` (seed idempotency, insert only, occasional never written, Super T one full day row, moved airing not rewritten, untouched rows rewrite) → AC-19, AC-21, AC-23
- [ ] `pnpm --filter @klt-cyber/shared test` → passes, including `formatKampalaDayHeading` (Today and Tomorrow roll at Kampala midnight) → AC-8

### Value sourcing
- [ ] Set the phone or browser to a far timezone (e.g. Los Angeles) → the Schedule's day headings and times, and the portal's week, still read Kampala days and times (`groupBroadcastsByKampalaDay`, `formatKampalaDayHeading`, NF-11)
- [ ] The nightly job's rows for Friday 23:00 start at 20:00 UTC Friday (`radioProgramOccurrences`, Kampala instant); one run at 21:30 UTC writes up to the end of the Kampala day seven days out (`radioMaterialiseHorizonEnd`)
- [ ] A broadcast with no host of its own shows its program's host; one with a guest shows the guest (`presentBroadcast`, host resolution)

## Slices 6 and 7: listening and the follow push

### Setup
- [ ] `pnpm exec convex env set PORTAL_ORIGIN "<the portal's origin>"` → `radio.getPlaybackConfig` returns a `cityLookupUrl` ending in `/api/where`
- [ ] On a deployed portal preview (not local dev), open `<portal>/api/where` signed out → `{"city":"..."}` with your city, and no redirect to sign in. Locally it answers `{}` → AC-16

### UI / manual
- [ ] During a broadcast, play for five minutes, then stop → `pnpm exec convex data listeningSessions` shows one closed stretch for your user and device holding about 300 seconds, within 30 → AC-12
- [ ] Play with no broadcast covering now → no stretch is created at all → AC-12
- [ ] Play, then force quit the app → about two and a half minutes later the stretch is closed at its last beat, and its seconds stop growing → AC-13
- [ ] Reopen and play again in the same broadcast → a NEW stretch opens; the old one is not revived; the broadcast's total is the sum of both → AC-13
- [ ] Listen on two phones signed in as the same person → two stretches; a sixth device on the same broadcast keeps playing but adds no stretch → AC-14
- [ ] Listen across a broadcast's end into the next one → the first stretch closes at the end crediting its last delta, and a new stretch opens on the next broadcast → AC-12
- [ ] While two people listen, the Media Radio page's "In app listeners" reads 2 within a minute, and "Whole stream" shows Caster FM's figure separately → AC-15
- [ ] Close a stretch, then `pnpm exec convex data listeningByCity` → one row for your city and today's Kampala date with the stretch's seconds; the closed stretch itself holds no city → AC-16
- [ ] Phone → Radio → Schedule → tap the bell on a program → it fills; open My Profile → Followed radio programs → that program's switch is already on; flip it off there → the schedule bell empties without a refresh → AC-9
- [ ] A fresh account → English Service, Luganda Service and Midweek Service read followed; every other program, Super T included, reads not followed → AC-10
- [ ] As a visitor (not a member), follow a program → it works the same as for a member → AC-9
- [ ] Follow a program, then start its source twenty minutes early → no push; at fifteen minutes before the start the next probe sends exactly one "<Program> is live" push; tapping it opens the Radio tab → AC-11
- [ ] Drop the source and bring it back during that broadcast → no second push → AC-11
- [ ] Cancel a broadcast and go live in its slot → no push; Force Live with the source off → no push → AC-11, AC-6

### Commands
- [ ] `pnpm run test:convex` → passes, including `radioListening.test.ts` (first beat credits nothing, the 45s cap, stopping, the split at `endsAt`, the five device cap, the stale gap, the sweep at the last beat, the city counter once, follower resolution, the push window and once per broadcast marker) → AC-11 to AC-14, AC-16

### Value sourcing
- [ ] Send a beat claiming nothing but a device id, with the phone's clock set an hour wrong → the credited seconds still follow the server's clock (`beat`, server `Date.now()`)
- [ ] Two overlapping broadcasts, a scheduled one and an `auto` one → beats attach to the scheduled one (`beat`, overlap order)
- [ ] With `PORTAL_ORIGIN` unset → `cityLookupUrl` is absent, beats still count, and `listeningByCity` stays untouched (`getPlaybackConfig`, `beat` city)
- [ ] A program followed by default, with one member who switched it off → that member gets no N33; everyone else does (N33 recipients)

## Recordings (slice 8)

### Setup
- [ ] On the bucket under test, CORS allows `PUT` from the portal's origin with `ETag` in the exposed headers, and a lifecycle rule aborts incomplete multipart uploads after seven days → without the CORS rule the upload stops with "Storage did not expose the part's ETag"

### UI / manual
- [ ] Media portal as a verified Media roster member → the sidebar shows Recordings → the page lists finished broadcasts of the last sixty days, newest first, never an unfinished one → AC-24, AC-32
- [ ] A Super T row shows "Never recorded" and no Upload button; calling `recordings:startUpload` for a Super T broadcast from the dashboard is refused with `RADIO_SUPER_T_NOT_RECORDED` → AC-24
- [ ] Upload form shows the export hint (MP3, mono, 64 kbps, about 30 MB an hour) → AC-25
- [ ] Pick a file over 500 MB → refused before upload; pick a non audio file → refused; call `startUpload` directly with `sizeBytes` over 500 MB or `contentType: "text/plain"` → refused with `RADIO_RECORDING_TOO_LARGE` / `RADIO_RECORDING_TYPE_UNSUPPORTED` → AC-25
- [ ] Call `signParts` or `completeUpload` with a key outside `radio/recordings/<broadcastId>/` (another broadcast's id, or `../`) → refused with `RADIO_RECORDING_KEY_INVALID` → AC-25
- [ ] Upload a file of about 70 MB (nine parts), cut the network after three parts → the error says to pick the same file; pick it again → the dialog offers "Resume upload", progress starts at about a third and reads "resumed", and the browser network tab shows parts four to nine only → AC-25
- [ ] Upload finishes → the row shows the length read from the file and the size; `activityLogs` has `radioRecording.uploaded` → AC-25, AC-26
- [ ] Replace on a row with a recording → the Replace button stays disabled until the replace box is ticked; after upload the old object is gone from the bucket and `activityLogs` has `radioRecording.replaced` → AC-26
- [ ] Calling `startUpload` on a broadcast that has a recording without `replace: true` → refused with `RADIO_RECORDING_EXISTS` → AC-26
- [ ] Remove → confirm → the recording leaves the page and the app, the object is gone from the bucket, `activityLogs` has `radioRecording.removed` → AC-26
- [ ] Phone → Radio → Recordings → the new recording is at the top straight away, showing program, broadcast date and length; filter chips narrow to one program; with more than twenty, "Show more" loads the next twenty → AC-27
- [ ] Tap a recording → it plays through the same player, the lock screen shows it as a recording, the hero reads "Playing a recording · tap to stop", and no listening stretch is written for it → AC-27, AC-12
- [ ] Start the live stream while a recording plays → the recording stops and the live stream takes over (one player) → AC-27, AC-2

### Value sourcing
- [ ] Inspect a `listRecordings` row's url → signed with an expiry of one hour; the broadcast row stores only the key → AC-27 (playback url)
- [ ] Start an upload declaring 10 MB, then send a larger file's parts → `completeUpload` reads the real size from storage, refuses over 500 MB and deletes the object (`startUpload` size, storage figure)
- [ ] A file whose length the browser cannot read → upload still succeeds and the row shows "Length unknown" (duration, display only)

## Radio inbox (slice 9)

### UI / manual
- [ ] Phone, off air → Radio → Now → both Prayer request and Testimony buttons are disabled, with "Prayer requests and testimonies open while a broadcast is on air." → AC-28
- [ ] On air, signed in as a visitor (not a member) → tap Prayer request → the form says it is anonymous → send → "Sent" confirmation → AC-28
- [ ] Type more than 1000 characters → the counter turns to an error and Send stays disabled; calling `radioInbox:submit` directly with 1001 characters is refused with `RADIO_INBOX_BODY_TOO_LONG` → AC-28
- [ ] Send five items of either type within an hour → the sixth is refused with "slow down" wording; an hour after the first, one more goes through → AC-28
- [ ] During Stream interrupted (source dropped under five minutes ago) → the buttons stay enabled and a send attaches to the broadcast still on → AC-28
- [ ] Media portal as a verified Media roster member → sidebar shows Radio inbox → items grouped under their broadcast, newest broadcast first; a testimony shows the sender's name; a prayer request reads "Anonymous" → AC-29, AC-32
- [ ] In the browser network tab, inspect the `listByBroadcast` response → a prayer request item has no sender field and the sender's user id appears nowhere in the payload → AC-29
- [ ] Mark prayed for → the item shows "Prayed for by <you>"; the mutation response is `null`; the `activityLogs` row has no sender and no body → AC-29, AC-31
- [ ] With more than ten broadcasts holding items → "Show older broadcasts" loads the next ten and none repeats → AC-29

### Commands
- [ ] `pnpm run test:convex` → passes, including `radioInbox.test.ts` (off air, trimming, body limits, the shared five per hour budget, sender privacy on the read and the mark, Pastoral read only, other departments refused, paging, the N34 count, its watermark and the hourly gap) → AC-28 to AC-31, AC-38

### Value sourcing
- [ ] A Pastoral delegate (department admin on Pastoral) reads the same inbox through `radioInbox:listByBroadcast`, sees the prayed for marks, and gets no Mark button; a Pastoral roster member gets `null` (`listByBroadcast` audience) → AC-38
- [ ] Three items arrive during one broadcast → within the hour the Pastoral HOD gets one push and bell notice "2 prayer requests and 1 testimony came in during <broadcast>."; the next hourly run sends nothing more for those items (`sendInboxDigest` count and watermark) → AC-30
- [ ] Revoke a Pastoral delegate, then send an item → the next notice skips them (N34 recipients resolved at send time) → AC-30

## Surfaces and the suite (slices 10 and 11)

### UI / manual
- [ ] Media portal → `/areas-of-service/media` → the dashboard renders (no redirect); the sidebar shows Dashboard first and the brand header links here → AC-34
- [ ] Live status card: the status pill derives on the page's own clock; force Live on the Radio page → the card shows "(forced)" and the banner naming who set it and when → AC-34, AC-6
- [ ] Last broadcast card with no listening ever recorded → "No listening recorded yet" empty state, not zeros; after a broadcast ends with people listening → its unique listeners and hours; a cancelled one is skipped → AC-34
- [ ] Delete tomorrow's devotional → the warning names tomorrow's Kampala date; as the HOD it links to Devotionals; as a roster member it says to tell the HOD; add the devotional → "All set" → AC-34
- [ ] A roster member opening Devotionals is sent to the dashboard, not out of the portal → AC-32
- [ ] Phone → Home while the radio is Live → a crimson "LIVE NOW" card under the greeting; tap it → the Radio tab opens; let the source drop (Interrupted) or go Off air → the card disappears → AC-35
- [ ] Delete an account that followed programs, sent a testimony and listened → its follow rows and inbox items are gone; the broadcast's listener totals are unchanged → AC-36
- [ ] With the network off, open each new screen (Radio tab segments, Followed radio programs, the dashboard, Radio, Programs, Recordings, Radio inbox) → a friendly error or retry, never a blank page or a crash; with no data → each shows its empty state → AC-37

### Commands
- [ ] `pnpm run test:convex` → passes, including `radioCore.test.ts` (the manageRadio matrix with real rows, the Super T, unfinished, prefix and size refusals, replace and remove with cleanup and logs, recordings ordering, filter and paging, the dashboard cards, the deletion sweep) → AC-24 to AC-27, AC-32 to AC-34, AC-36

### Value sourcing
- [ ] One listener on two devices plus a second listener on the last broadcast → the dashboard shows two unique listeners and hours summed over all three stretches (`getMediaDashboard` last broadcast)
- [ ] The devotional check uses tomorrow's Kampala date: at 23:30 Kampala on the 11th it looks for the 12th, at 00:30 on the 12th it looks for the 13th (`getMediaDashboard` devotional)

## Acceptance-criteria coverage
- Built and checkable now: AC-1 to AC-39, all of them (AC-11's mute exclusion waits on feature 28)
- Not built yet: none
