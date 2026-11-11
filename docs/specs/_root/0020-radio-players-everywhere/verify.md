# Verify: Radio players everywhere · spec 0020 · updated 2026-11-11
_Steps derived from spec 0020's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Spec 0020 is Assumed: it owes ratification by `/architect`, which does not block verifying it._

## Setup
- [ ] `RADIO_STREAM_URL` and `RADIO_STATUS_URL` set on the deployment under test (see spec 0019's verify setup), so the status can read Live
- [ ] `PORTAL_ORIGIN` set to the portal serving `/radio/*.jpg` (staging: `https://klt-cyber.luswataandrew190.workers.dev`), so the lock screen card has artwork
- [ ] A fresh native build of the app: the player provider moved to the root layout, and lock screen behaviour is only true on a real device

## UI / manual: the portal player
- [ ] Signed in to the portal, in any module (System Admin, a department, Media), with the radio Off air → no player anywhere → AC-1
- [ ] The stream goes Live → within about fifteen seconds a floating card appears bottom right (a full width bar on a narrow window) with LIVE, the program, the host and its artwork; it never starts playing on its own → AC-1
- [ ] Press play → audio within a few seconds; move between pages and modules → it keeps playing without a restart → AC-3
- [ ] The operating system's media panel (or the browser's media button) names the program and host, with artwork; pausing there stops the stream → AC-3
- [ ] While listening in the portal, the Media page's in app listener figure does not move, and `listeningSessions` gains no row for that person → AC-2
- [ ] While listening, the status drops to Interrupted → the card stays, marked Interrupted, so its controls do not vanish → AC-1
- [ ] While listening, press the minimize arrow → the card folds into a LIVE pill at the same corner with moving bars, and the audio keeps playing; click the pill → the full card returns; minimize again and reload → still a pill for this broadcast; at the next broadcast the full card shows → AC-4
- [ ] Minimize while not listening → the pill shows a radio icon and "Live"; when the radio goes Off air the pill leaves too → AC-1, AC-4
- [ ] Press play while nothing reaches the browser for eight seconds → "Nothing on air right now", then the card steps back; pressing stop while connecting never shows that message → AC-1
- [ ] Sign out while listening → audio stops → AC-8

## UI / manual: the app
- [ ] Play the live stream from the Radio tab, then go to Home, Giving and Updates → a mini player sits just above the bottom navigation with LIVE, the program and host, play and close; it is absent on the Radio tab itself → AC-5
- [ ] Open the More panel → the mini player steps aside; close it → it returns → AC-5
- [ ] Open a drill down screen (an event, Followed radio programs, My Profile) → the mini player floats at the bottom; on profile completion, delete account and the give checkout it is absent → AC-5
- [ ] Open the keyboard on any screen → the mini player hides until the keyboard closes → AC-5
- [ ] Tap the mini player's body → the Radio tab opens; tap close → playback stops and the bar leaves → AC-5
- [ ] Play a recording, pause it from the mini player at 3:00, resume → it carries on from 3:00 rather than restarting; the bar shows "Paused" and a progress line meanwhile → AC-6
- [ ] Pause a recording from the lock screen, then resume it from the lock screen → it carries on from where it stopped → AC-6
- [ ] Let a recording play to its end → the player returns to rest and the bar leaves → AC-6
- [ ] Lock the phone while live → the notification and lock screen card show the program as the title, "<host> · Reign Radio" below it, "Live on Reign Radio", and the program photo → AC-7
- [ ] Stay locked across a program change (for example Morning Glory ending into the next program) → within about thirty seconds the card names the new program → AC-7
- [ ] Sign out while playing → audio stops and the lock screen card clears → AC-8

## Commands
- [ ] `pnpm run test:convex` → passes, including `radioCore.test.ts`'s `getPlaybackConfig artwork` case (`artworkBaseUrl` from `PORTAL_ORIGIN`, omitted without it, null signed out) → AC-7

## Value sourcing
- [ ] A program with an uploaded image → the lock screen and the portal card both use that image (program `imageKey` through R2)
- [ ] A seeded program with no uploaded image, for example Morning Glory → the card loads `https://<portal>/radio/morning-glory.jpg`; one with no hosted photo, for example English Service → `/radio/default.jpg` (portal hosted fallback)
- [ ] With `PORTAL_ORIGIN` unset → the lock screen card shows no artwork rather than a broken one, and playback is otherwise unchanged (`artworkBaseUrl` omitted)

## Acceptance-criteria coverage
- AC-1 portal steps 1, 2, 6, 8 · AC-2 portal step 5 · AC-3 portal steps 3, 4 · AC-4 portal step 7 · AC-5 app steps 1 to 5 · AC-6 app steps 6 to 8 · AC-7 app steps 9, 10, Commands, Value sourcing · AC-8 portal step 9, app step 11
