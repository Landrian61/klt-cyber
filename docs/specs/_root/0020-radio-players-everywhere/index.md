# 0020 · Radio players everywhere: a portal player, a mini player in the app, and a proper lock screen card

**Status**: Assumed
**Date**: 2026-11-11
**Authorized by**: Luswata Andrew, during /develop (extending feature 20, Radio core)

## Owed decision

Spec 0019 builds the one player in the mobile app's Radio tab and nowhere else. SRS 4.9 describes the portal's Radio page as status, override, schedule and listeners, with no player, and says members listen "in the app". The engineer asked for more:

1. A live player in the web admin portal.
2. A minimal player that stays visible in the mobile app on every screen while something plays.
3. A notification and lock screen card that looks like a real music player, naming the program.

Who sees the portal player, whether portal listening counts, where each player sits and what the lock screen shows were not decided anywhere.

## Assumption built on

The engineer's answers, with the design calls they delegated ("your call on how best to design it"):

- **Portal listening never counts.** The portal player sends no listening beats, so listening stretches, both listener figures, Radio Insights and the city counter stay app only, as SRS 4.9 says.
- **The portal player appears in every portal module**, for anyone signed in to the portal, and only while the derived status is Live (override included, the same status readers are shown). It stays on screen while it is playing even if the status changes, so its controls never vanish under the person using them. It never plays on its own; a person presses play.
- **Its design is a floating card at the bottom right of the portal**, a full width bar on narrow screens. Not the sidebar: each portal module has its own sidebar (the shared shell, Media's bespoke one, System Admin's), so a sidebar player would be built once per module, while a floating card mounts once in `app/(admin)/layout.tsx`, the mount point that layout already exists for. It persists across navigation inside the portal. It is never dismissed out of reach: minimizing folds it into a small LIVE pill in the same corner, the audio keeps playing, and the pill opens it again. Minimized lasts for the current broadcast, so the next broadcast announces itself with the full card.
- **The browser's own media controls** (the Media Session API) carry the program name, host and artwork, so the stream shows in the operating system's media panel like any other audio.
- **The mobile mini player** shows on every signed in screen while the one player is playing, connecting, or holding a paused recording, except on the Radio tab itself (its hero is the full player) and on flows where it would cover the main action (profile completion, account deletion, giving checkout). On the tabs it sits just above the bottom navigation; on other screens it floats at the bottom. Tapping it opens the Radio tab. It carries play and pause, and a close that stops playback.
- **Recordings pause and resume** in place, as any music app does, instead of restarting. The live stream stops on pause, because resuming a live stream must rejoin the live edge rather than replay a stale buffer (spec 0019).
- **The player provider moves from the tabs layout to the root layout**, inside the signed in area, so screens outside the tabs can reach it. Signing out stops playback.
- **The notification and lock screen card** shows the program name as the title, the host and "Reign Radio" as the subtitle, "Live on Reign Radio" or "Reign Radio recording" as the album line, and the program artwork. It updates when the program on air changes.
- **Lock screen artwork comes from a web address, never a bundled image.** `expo-audio` downloads `artworkUrl` as a Java `URL` on Android, and a bundled image resolves to a resource name in a release build, so spec 0019's bundled fallback can never reach the notification. Source, in order: the program's uploaded image (signed R2 url), else a copy of the bundled program photo served by the admin portal at `/radio/<seedKey>.jpg`, else `/radio/default.jpg`. The phone learns the portal's address from `getPlaybackConfig` (`artworkBaseUrl`, from `PORTAL_ORIGIN`, omitted when unset, in which case the card simply has no artwork). In app screens keep using the bundled images.
- **Not changeable here**: the small status bar icon on Android is fixed by `expo-audio` 1.1.1 to a generic play icon.

## Code area

- `apps/admin/app/(admin)/layout.tsx`, `apps/admin/components/radio/PortalRadioPlayer.tsx`, `apps/admin/public/radio/`
- `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/lib/radio-player.tsx`, `apps/mobile/lib/radio-artwork.ts`, `apps/mobile/components/radio/mini-player.tsx`
- `convex/radio.ts` (`getPlaybackConfig` gains `artworkBaseUrl`)

## Requirements

- **AC-1**: A signed in portal user anywhere in the portal sees the player while the radio is Live and not otherwise, unless they are already listening.
- **AC-2**: Playing in the portal writes no listening stretch and changes no listener figure.
- **AC-3**: Playback continues while moving between portal pages, and the browser's media panel names the program.
- **AC-4**: Minimizing the portal player folds it into a LIVE pill in the same corner without stopping the audio; the pill restores it, and the next broadcast opens it in full.
- **AC-5**: In the app, a mini player shows on every screen except the Radio tab and the excluded flows while audio is playing, connecting or a recording is paused; tapping it opens the Radio tab.
- **AC-6**: A recording pauses and resumes from where it was, from the app and from the lock screen.
- **AC-7**: The notification and lock screen card show the program name, the host and Reign Radio, the program artwork over https, and update when the program changes.
- **AC-8**: Signing out stops playback.

## Owed to the SRS

SRS 4.9 should gain one line that the portal has a listen only player whose listening is never counted, and R1-02 a line for the mini player and the paused recording. `/architect` owns that amendment when it ratifies this.

## Ratify

This decision was recorded by /develop, not deliberated. Run `/architect Radio core: ratify spec 0020` to deliberate and ratify it, and to make the SRS amendment above. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
