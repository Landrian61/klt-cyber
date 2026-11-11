# 0019. Radio core: reasoning, options and sources

Companion to [index.md](index.md). This file is the decision record: why this shape was chosen, what else was weighed and what the recommendations rest on. A build does not need it.

## Context

> ⚠️ Premise note: this topic is at the very top of what one spec should carry. It spans seven decisions that could each have been specced alone (playback and background audio, status detection, the schedule data model, listening records, follows and the live push, recordings, and the Radio inbox), and it has to resolve two places where the SRS contradicts itself before any of them can be built. It is kept as one spec because the scope has it as one feature (number 20), because all seven share one data model that SRS 4.4 insists be designed as a whole before Super T and Radio Insights, and because splitting it would mean seven specs each waiting on the others' tables. If it grows during the build, the honest next move is to promote it to an umbrella with children per surface rather than letting one file sprawl further. The two contradictions are carried as Follow-up items against the SRS rather than silently resolved: SRS 3.3 and 4.9.2 say every Media roster member is a portal user while F3-19 excludes Media, and N34's trigger ("a new prayer request or testimony outside broadcasts") describes a state that cannot occur once sending is only possible on air.

The Radio tab is the least honest screen in the app. It shows a fixed count of 47 listeners, a list of three invented comments, a notes box for a feature the SRS has deferred, and a weekly schedule read from `apps/mobile/data/programs.ts`, a file bundled into the app whose own comment admits it exists because the screen was never wired to the backend. Nothing on the screen plays. NF-18 says no mock data, fake counts or false confirmations reach users, and this screen breaks that rule four times over.

Underneath the screen there is nothing at all. There is no radio table in `convex/schema.ts`, no broadcast concept, no listening record and no status. Media, the department that actually runs Reign Radio, has a portal with two content pages (Devotionals and Past events) and an index that redirects to the first of them. The stream itself lives outside the platform on Caster FM, where broadcasts are started and stopped by hand, so the platform can only ever observe it, never control it.

Three later features are blocked on the model this feature defines. SRS 4.4 states it directly: the Radio data model must be designed before the clan portal's Super T and listening features are built. Feature 23 needs gate level attribution of listening, feature 32 needs totals and city breakdowns across a date range, and feature 19 needs the Radio inbox the mobile app writes into. A shape chosen loosely here is a backfill later, in the two places where the data cannot be recovered after the fact: time already listened and cities already visited.

The forces that shaped the choice are the church's size and the church's connection. There are about fifty ministers at launch on 29 November 2026, so nothing here needs to scale past a few hundred concurrent listeners, and operational simplicity is worth far more than throughput. The connection is the opposite constraint: NF-07 asks for uploads that resume after an interruption, and an hour of spoken word is about 30 MB, which on a Kampala connection is long enough to drop. The team is one developer on the backend and sensitive work, so a decision that needs a new service to operate is a decision that costs more than it looks.

## Options considered

### Option 1: the thinnest honest radio

Play the stream, show a status, and drop everything that needs new tables. The schedule reuses the existing `weeklyPrograms` table (which already models recurring church programs with cancellations), listening is not recorded at all, and recordings wait for a later feature.

**Pros**

- Shippable in a fraction of the time, and the single worst problem (the fake screen) is solved immediately.
- No new tables, so nothing to get wrong for features 23 and 32 to inherit.

**Cons**

- Leaves R1-06 to R1-08, all of R2 and all of RC1 unmet, which is most of the feature.
- `weeklyPrograms` is Administration's table for church programs with a different audience, different permissions and no concept of a host, a stream or a recording. Forcing radio into it would couple two departments' content and make both harder to change.
- Listening history cannot be recovered later. Every day without it is a day feature 32 can never report on.

### Option 2: materialised broadcasts, polled status, heartbeat listening (chosen)

Recurring programs are templates; a nightly job writes real broadcast rows ahead for seven days. A Convex cron polls Caster FM's public statistics endpoint every minute, and while a broadcast is on that same run schedules two more probes so the reading is never more than twenty seconds old, with a manual override on top that wins. The phone beats every thirty seconds while audio plays, and the backend keeps one listening stretch per user, device and broadcast. Recordings upload to R2 in presigned multipart chunks. Everything runs on what the repository already has.

**Pros**

- Every acceptance criterion in the feature is reachable, and listening and city history start accruing from day one.
- A broadcast is a real row, so listening, recordings, inbox items and adjustments all attach to something that exists, with no "resolve the template" step on any write path.
- No new infrastructure and no new external service. The crons, the R2 gateway, the push plumbing and the capability machinery are all already in use elsewhere in this repository.
- The server computes listening seconds from its own clock, so the figure the church reports is not the client's claim.

**Cons**

- Four new scheduled jobs are more moving parts than the other options, and a job that silently stops is a schedule that silently empties, which is why a stale probe has to read as Off air rather than as whatever it last saw.
- Materialised rows must be protected from the job that writes them, which is an explicit rule (adjusted, cancelled or recorded rows are never touched) rather than something the schema enforces.
- Multipart signing is new code in a part of the system nobody has worked in yet, and the R2 component does not provide it.
- Heartbeats mean a write per listener every thirty seconds. Trivial at fifty listeners, and something to watch if the congregation arrives at once.

### Option 3: client reported status and listening

No server polling. The phone reports what it actually hears, and the status and the listener count are derived from what the phones say: if several phones are receiving audio, the radio is live. Listening is whatever the clients claim.

**Pros**

- No probe, no cron burst, no dependency on Caster FM exposing anything, and the status reflects what listeners truly experience rather than what a server can reach.
- Fewest backend moving parts of the three working options.

**Cons**

- With nobody listening there is no status at all, so the "live now" push has no trigger and Home's Live now card can never appear for the first listener. The first person to tune in is the one the feature fails.
- Every figure becomes the client's word. A church reporting listening hours to itself can live with that; a church reporting them in a PDF (RI1-08) cannot.
- Media's override and the Off air versus Interrupted distinction both lose their reference point.

### Option 4: lean on the provider

Embed Caster FM's own player and widgets, and read the status, the schedule and the listener figures from the provider instead of modelling them.

**Pros**

- Almost no backend work, and the provider's listener figure counts the whole audience rather than only the app.
- Status is the provider's own truth, with nothing to detect.

**Cons**

- SRS 4.9.1 is explicit that only in app listening is counted and every figure is labelled "in app listeners", which a provider figure cannot satisfy. It also requires per user listening (R1-08) that the provider has no concept of.
- A web view player cannot drive lock screen controls or satisfy NF-09, and it cannot be followed, recorded against or tied to Super T gates.
- Features 23 and 32 would have no data model at all, which is exactly what SRS 4.4 forbids.

## Rationale

Option 2 is chosen because of the two forces in Context that cannot be deferred: the data the later features need is data that cannot be recovered afterwards, and the church is small enough that the simpler options' savings are small while their losses are permanent. Listening time and city totals exist only while someone is listening. Option 1 and Option 4 both trade them away for build time, and they are the one thing a later feature cannot backfill. Option 3 keeps them but makes them the client's word, which stops being acceptable the moment RI1-08 prints them in a report in the church's own theme.

Materialising broadcasts rather than computing them (the way `weeklyPrograms` does, which was the tempting precedent here) is the specific call worth defending. The repository already has the computed pattern, and reusing it would have been the familiar move. But every write path in this feature needs a broadcast to point at: a listening beat, a recording, an inbox item, an adjustment, a follow push's "once per broadcast" marker. With computed occurrences, each of those has to resolve a template against a clock first, and a program edited later silently rewrites what past airings were. Real rows cost a nightly job and one protection rule, and they make every other part of the feature a plain foreign key.

Keeping everything on the existing stack follows from the team's size rather than from the technology being ideal. `expo-audio` is already installed and the landscape check confirmed it does what NF-09 needs, including lock screen controls and a live stream mode, so the alternative (`react-native-track-player`) would add a native dependency whose own maintainers say they do not use Expo, for control this feature does not need. The same logic settles the city lookup: the engineer's first instinct was a third party IP lookup, and the only free tier that survived checking was usable, but the portal is already a Cloudflare Worker and Cloudflare hands the city to it for nothing on every plan. Choosing that avoided a new entry in SRS section 7 and a new row in the cost register for a value used only in an aggregate counter.

Two of the engineer's choices go against the recommendation here, and both are recorded so they are accepted knowingly rather than by accident. The override was offered with an automatic lapse, on the grounds that a forced "Live" left on over a weekend tells every member the radio is on air when it is silent, which is precisely the NF-18 failure this feature exists to end; the engineer chose an override that holds until a person clears it, and the banner plus the dashboard card are what stands in for the lapse. Sending to the inbox was offered as always available, on the grounds that the person most likely to need prayer at 2AM is the one this rule turns away; the engineer chose to allow it only while a broadcast is on air, which also makes N34's trigger unreachable and is why the hourly digest exists at all. Both are workable. Both are the kind of decision worth revisiting after the pilot rather than at the next bug report.

## Evidence: the landscape checks

Two capped, read only checks ran during the design conversation, on 11 November 2026. Their findings are recorded here because they changed the design rather than merely confirming it.

**Audio playback.** Expo's SDK documentation confirms `expo-audio` supports background playback through `setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' })` plus the plugin option `enableBackgroundPlayback`, which adds the Android `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions with a media foreground service, and the iOS `UIBackgroundModes: ["audio"]` entry. Lock screen and notification controls come from `setActiveForLockScreen(active, metadata, options)` and `updateLockScreenMetadata(metadata)`, with an `isLiveStream` option. Two caveats shaped acceptance criteria: Android stops background audio after about three minutes unless `setActiveForLockScreen` has been called, which is why AC-2 names ten unbroken minutes on a real device; and the documentation's own example uses `mixWithOthers`, which conflicts with holding the lock screen, so `doNotMix` is specified instead. There is no documented API for custom remote command handlers, and the native service does not work in Expo Go, so a development build is required.

`react-native-track-player` was checked as the alternative. Its latest release is v5, its release date could not be resolved to a year, its npm page refused the request and its own install documentation returned 404. Its maintainers state they do not use Expo and that their ability to resolve Expo issues is limited, and community reports of "Native module cannot be null" under Expo exist. No SDK 54 or React Native 0.81 compatibility note was found either way. That is why it is the fallback in Follow-up rather than the recommendation.

**Caster FM.** Caster FM documents a public endpoint at `https://domain:port/admin/publicstats.json`, with no authentication, returning server fields and per mount source fields including `listeners`, `listenurl`, `display-title`, `genre`, `stream_start_iso8601` and `content-type`. A connection error from the endpoint means the server is offline. `admin/stats.json` and `admin/listclients.json` exist but need basic authentication. The generic Icecast `status-json.xsl` is not documented for their servers, which is why the design targets `publicstats.json` specifically with a ranged request to the audio url as the fallback. The church's own domain and port were not discoverable and must come from the dashboard, which is the Follow-up item for `RADIO_STATUS_URL`.

**City lookup.** Of the third party services checked, only `ipwho.is` was usable (1,000 requests a day counted per client IP, no key, HTTPS, city included, commercial use allowed). `ipapi.co`'s free tier is a time limited trial marked not for production, `ipinfo.io`'s free Lite tier is country level only and requires attribution, and `ip-api.com` offers no HTTPS on its free endpoint and forbids commercial use. Cloudflare Workers expose `request.cf.city`, `.country`, `.region` and `.postalCode` on all plans, including free, but only for a request that reaches a Worker, which is why the lookup is a route on the portal rather than a call from the phone to a third party. What the check did not confirm is whether this adapter (`@opennextjs/cloudflare`) surfaces that object through `getCloudflareContext()`, hence the verification Follow-up.

**Multipart uploads.** Verified in the repository rather than on the web: `@convex-dev/r2` depends on `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, both already present in `node_modules`, and its own typings expose no multipart API. So multipart is the project's own code over the AWS S3 client, with the component keeping its single PUT role for photos. The installed `cloudflare-r2` skill supplies the universal S3 constraints (parts of at least 5 MB, at most 10,000 parts per upload) but its examples target the Workers R2 binding, which this build does not use.

## What the cross check changed

An independent read of the drafted spec on a different model, on 11 November 2026, before the spec was accepted. It is recorded because five of its findings changed the design rather than its wording, and a later reader should know the first draft said otherwise.

- **A program stored an end time**, with "end earlier than start" meaning it crossed midnight. Super T runs a full day, so its end equals its start, which that rule reads as zero length. The program now stores `durationMinutes`.
- **The in app listener figure was a reactive query over the beats**, so every listener's beat invalidated every other listener's open screen, and a query over "the last sixty seconds" does not re-evaluate itself anyway. It is now a number the probe writes to the status row.
- **The city counter was written on every beat**, which makes one row per city and day the hottest row in the system. It is now written once when a stretch closes, and the counter lost its broadcast field so its key is unambiguous.
- **The probe rescheduled itself**, so a probe that threw before rescheduling stopped the fast loop until the next minute, with nothing guarding against two chains running at once. The minute cron now schedules the two faster probes itself and no probe schedules another.
- **Nothing served Pastoral the inbox**, although an acceptance criterion and a test both named a Pastoral caller, because the only read was gated on `manageRadio` and a Pastoral HOD is not Media. That one query now serves both departments.

It also caught two contradictions inside the draft: `radio.beat` took a `broadcastId` while the value sourcing table said the server resolves it (the input is gone), and a Live override with no stream would have fired the follow push, opened no broadcast and left listening with nothing to attach to (the override is now display only, and the probe's own finding drives everything else). The rest of its findings were limits, formats, orderings and failure rules the draft had left for the build to invent: the beat credit cap, the sweep's relationship to a later beat, the materialisation's idempotency key and cron time, the duplicate name comparison, the multipart resume mechanism and its bucket prerequisites, the digest watermark, the deletion policy per table, and the rule that a stale probe must read as Off air so a stalled cron cannot leave the app claiming to be live.

## References

**Project sources** (verifiable, in this repository)

- `spec/SRS.md` sections 4.4, 4.9, 5, 6, 7 and 9: the requirements, the notification catalogue, the external services table and the data rules this spec is built from.
- `AGENTS.md`: the two permission dimensions that must not be conflated, the embed versus reference rule, the cardinality in mutations rule and the audit log convention.
- `convex/lib/authz.ts`: `DEPARTMENT_CAPABILITIES`, `DEPARTMENT_SCOPED_CAPABILITIES` and `LEADERS_ONLY_PORTAL_DEPARTMENTS`, the machinery `manageRadio` joins.
- Spec 0015 (Library) and spec 0018 (Real Estate): the two existing department scoped capabilities this one copies.
- Spec 0012 (shared department shell) and `apps/admin/lib/departmentRoutes.ts`: why Media's portal is bespoke and was deliberately left leaders only.
- Spec 0009 and `convex/weeklyPrograms.ts`: the computed occurrence pattern this spec declines, and `convex/calendar.ts` for the Kampala time helpers it reuses.
- Spec 0008 and `convex/accountDeletion.ts`: the deletion sweep the three new user owned tables must join.
- `convex/uploads.ts` and `convex/library.ts`: the existing R2 round trip and its metadata checks.
- `.agents/skills/cloudflare-r2/SKILL.md`: S3 multipart part size and part count limits.

**Practices and standards**

- Derive status on read rather than storing it, so no reader can see a stale value.
- Compute billable or reportable quantities on the server from server clocks, never from a client's claim.
- Heartbeat with a sweep rather than trusting an explicit stop, because mobile processes are killed without notice.
- Do not store negative space: the absence of a follow row means the default, which keeps a corrected default from needing a backfill.
- Keep aggregate counters free of any identifier, so a privacy rule holds by construction rather than by query discipline.
- Idempotent seeds, so running one twice is safe.

**Links** (web verified during the design conversation, 11 November 2026)

- Expo Audio (SDK 54): https://docs.expo.dev/versions/latest/sdk/audio/
- react-native-track-player releases: https://github.com/doublesymmetry/react-native-track-player/releases
- Caster FM broadcast status API: https://www.caster.fm/help/cloud/api-documentation/streaming-server-broadcast-status/
- Cloudflare Workers Request API, including `request.cf`: https://developers.cloudflare.com/workers/runtime-apis/request/
- ipwho.is documentation, the third party runner up: https://ipwhois.io/docs
- ip-api.com JSON API, rejected for lack of HTTPS and commercial use: https://ip-api.com/docs/api:json
- ipinfo.io pricing, rejected as country level only on the free tier: https://ipinfo.io/pricing
