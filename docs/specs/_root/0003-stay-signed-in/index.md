# 0003. Fix session persistence across mobile and the web portal

**Date**: 2026-10-10
**Status**: In Progress

## Summary

Ministers are being asked to sign in again every time they reopen the mobile app, even the same day, which the scope calls a launch blocker. A closer look confirmed one real bug (signing out does not actually end the session on the server) but ruled out the idea that this was the whole explanation, so the real cause of the cold launch sign out is still being tracked down, as the first build step, rather than assumed. This spec also gives both the mobile app and the web admin portal the same deliberate session length, 30 days, refreshed on use, since neither surface has an explicit rule for that today.

## Requirements

**User stories**:
- As a minister, I want the app to remember that I'm signed in so that I don't have to sign in again every time I open it.
- As a minister, I want to be signed in on more than one phone at once, without one signing the other out.
- As a department or clan role holder, I want the web portal to remember that I'm signed in too, so that I don't lose my place in the middle of real work.

**Acceptance criteria**:
- **AC-1**: Reopening the mobile app after it was fully closed, with a session that was previously established, goes straight to Home with no sign in screen shown, on every build variant (development, preview, production).
- **AC-2**: A session, mobile or web, stays valid for 30 days, and that window resets every time the session is actually used; after 30 days with no use on either surface, the next visit requires signing in again.
- **AC-3**: An explicit sign out, from the mobile app's Settings or from the web portal, ends the session on the server immediately, not only on the device; the next visit, even minutes later, requires signing in again.
- **AC-4**: Opening the mobile app with no network connection yet available still shows Home right away, from the stored session alone; if that session later turns out to be invalid, the failure shows through the app's existing offline and error handling (spec 0002), not a silent bounce to the sign in screen.
- **AC-5**: Signing in on a second device or browser does not end the session on the first; all stay signed in independently, on mobile and on the web portal.
- **AC-6**: Returning to the web admin portal (reopening the browser, revisiting the link, or refreshing) with a previously established session lands directly on the signed in area, with no sign in redirect, for as long as AC-2's window holds.

## Decision

**Chosen option**: Option 1: Diagnose the real cold launch cause first, then fix what is confirmed, for both surfaces.

Investigate the real cold launch cause as the first build step. Separately, register `expo()` and widen `trustedOrigins` (fixes the confirmed sign out bug, and may also fix the cold launch bug if the diagnostic points there). Set one explicit 30 day rolling session length shared by the mobile app and the web admin portal.

## Feature design

**Data model sketch**: None. Session state lives entirely inside the Better Auth component's own tables, for both surfaces; nothing is added to `convex/schema.ts`.

**State transitions**: A session is active from sign in. It becomes expired after 30 days with no authenticated activity on either surface (the window resets on each use). It becomes revoked immediately on an explicit sign out, once AC-3's fix lands. Account deletion (feature 8, not yet built) will end it too; that is out of scope here.

**API surface**: No new endpoints. This feature changes configuration and plugin registration on Better Auth's existing routes (mounted through `convex/http.ts`), shared by both apps; it does not add, remove, or change any route's inputs or outputs.

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| Mobile cold launch session check | Whether to show Home or the sign in screen | Diagnosed in build task 1; unconfirmed today, see Build plan |
| Session validity window, both surfaces | The 30 day rolling expiry | A new `session: { expiresIn, updateAge }` block in `convex/auth.ts`'s `betterAuth(...)` config (2,592,000 seconds and 86,400 seconds), set once, used by both apps |
| Trusted origin check | Which callers may establish, refresh, or end a session | The `trustedOrigins` array in `convex/auth.ts`, extended with the app's three schemes. The schemes are defined once as a shared constant in `packages/shared` and imported by both `apps/mobile/app.config.ts` and `convex/auth.ts`, never written twice as string literals in two unrelated files |
| Offline mobile cold launch route | Whether to show Home before any network round trip completes | The keychain stored token alone; Build plan task is to verify this already works, not to build it |
| Web portal reopen | Whether to show the signed in area or redirect to sign in | The existing session cookie checked by `apps/admin/middleware.ts`'s `getSessionCookie`, now backed by the same 30 day policy |

**Key invariants**:
- The device's or browser's own stored session is the only thing deciding "am I signed in" at launch or page load; the backend is never on the critical path for that first route decision.
- The trusted origins list holds exactly the app's three schemes plus the admin site's URL, nothing else, defined in one place.
- A session's 30 day window always resets on genuine use, on either surface; only 30 days of no use, an explicit sign out, or (once built) account deletion end it.

**Security model**: Session state is scoped to the signing in device or browser only, through Better Auth's own routes; this feature adds no new application level authorization and does not touch the `users.role` or `roleAssignments` dimensions. The web admin portal gets the same 30 day window as the mobile app, a deliberate choice: admin role holders carry real power and sometimes use shared office machines, but the friction cost of a short window is real too, and the mitigation already in place (the device's own lock screen, plus account deletion once feature 8 ships) was judged sufficient rather than adding a second, surface specific session policy. Multiple concurrent sessions per person are allowed by design, on both surfaces. There is no remote "sign out everywhere" control in this feature, so a lost or borrowed unlocked device stays signed in until it goes 30 days idle or the account is deleted. No regulated data (payments, health) is touched by this change.

**Critical test scenarios**:
- Diagnostic: on a freshly installed preview APK, sign in, force stop the app (not reinstall), relaunch it, and capture whether the keychain still holds the session key and what `/get-session` answers. Informs AC-1's fix, not a pass or fail test on its own.
- Happy path, mobile: once the diagnosed fix lands, sign in on the preview APK, fully close the app, reopen it; it shows Home with no sign in screen. Verifies **AC-1**.
- Happy path, web: sign in to the admin portal, close the browser entirely, reopen it and revisit the portal link; it lands on the signed in area with no sign in redirect. Verifies **AC-6**.
- Failure case: put the mobile device in airplane mode before reopening the app; Home still renders immediately from the stored session. Verifies **AC-4**.
- Auth and permission: sign out, mobile or web, then revisit; it asks to sign in again right away, and a direct check of the Better Auth sessions table confirms the session row is actually gone, not only forgotten locally. Verifies **AC-3**.
- Expiry: after a session is used more than 24 hours after it was created, confirm its `expiresAt` value in the Better Auth sessions table moved forward rather than staying fixed. Verifies **AC-2**.
- Multi device: sign in on a second device or browser with the same account; the first, left open, is still signed in when revisited. Verifies **AC-5**.

## Build plan

1. Diagnose the real cold launch cause before changing code: on a freshly installed preview APK, sign in, force stop the app (not reinstall), relaunch it, and capture whether the keychain still holds the session key the `expoClient` plugin wrote, and the status and body of the `/get-session` call the app makes on that relaunch. This is the investigation F1 09 calls for; do not skip it. **(Open — needs a physical/emulated device, deferred to the engineer.)**
2. Branch on what step 1 shows: if the keychain holds no session key on relaunch, the bug is in how or when the app writes the session, likely in `apps/mobile/lib/auth.ts` or the sign in flow itself, and the fix belongs there instead of step 3. If the keychain does hold the key but `/get-session` answers null or an error, proceed with step 3 as the leading candidate fix. If neither explains it, stop and get more logging before guessing further. Satisfies the investigation behind **AC-1**. **(Open — depends on step 1.)**
3. ~~Register the `expo()` server plugin from `@better-auth/expo` in `convex/auth.ts`'s `betterAuth({ plugins: [...] })` list, alongside the existing `crossDomain` and `convex` plugins.~~ **Done** — confirmed against the installed library source: `expo()`'s `onRequest` rewrites the `expo-origin` header onto `origin` only when the request has no `origin` header already, which is exactly how the mobile client's `expoClient` plugin tags its requests. Satisfies **AC-3**; may also satisfy **AC-1** pending step 2's branch.
4. ~~In the same file, extend `trustedOrigins` to include the app's three schemes...~~ **Done** — added via a new shared constant (`packages/shared/src/constants/appSchemes.{json,ts}`), imported by `convex/auth.ts` through the normal barrel and by `apps/mobile/app.config.ts` via a deep `.json` import (that file runs under plain Node during Expo config evaluation, not Metro, so it can't resolve the barrel's chain of extensionless TypeScript imports — a leaf `.json` file is the one artifact Node resolves natively regardless of version). Confirmed against `better-auth`'s own `matchesOriginPattern` that a non-http(s) pattern matches via `url.startsWith(pattern)`, so each trusted entry is `<scheme>://`. Satisfies **AC-3**; may also satisfy **AC-1**.
5. ~~Add an explicit `session: { expiresIn: 2592000, updateAge: 86400 }` block...~~ **Done**, in `convex/auth.ts`. Reaches both apps since they share this one config. Satisfies **AC-2**, **AC-6**.
6. ~~Correct the comment in `apps/mobile/lib/auth.ts`...~~ **Done.**
7. Verify, rather than build, that the mobile app's offline cold launch path already works as **AC-4** describes. Code-read check done: `apps/mobile/app/_layout.tsx` reads the cached session synchronously (via the `expoClient` plugin's local cache) before `isPending` resolves, and the route decision never waits on a network round trip — consistent with the spec's claim. **A real-device confirmation is still open**, alongside step 1.
8. Push the `convex/auth.ts` changes to the dev deployment first, then to staging (merge to `main`), then to production, the same order as any other backend change. Pushed to the personal dev deployment during this build (typecheck + functions ready, confirmed). **Staging and production pushes are open** — those happen via the normal `main`/`prod` PR flow, not from here.
9. Verify by hand, on both surfaces: a sign out really ends the session row on the server, not only locally (**AC-3**); a session used after 24 or more hours shows its expiry moved forward (**AC-2**); a second device or browser signing in does not sign out the first (**AC-5**); reopening the web portal after closing the browser stays signed in (**AC-6**); and, if step 2 resolved a branch, that the mobile cold launch bug is actually gone (**AC-1**). **Open** — see `verify.md`.

This stays a single, thin, end to end slice, consistent with the project's Tracer Bullet approach, now led by a real diagnostic instead of an assumption.

## Consequences

**Positive**:
- Removes the launch blocker the scope calls out, once the real cause is found and fixed, rather than papering over a guess.
- Fixes a second, confirmed bug (sign out not actually ending the session on the server) that the investigation surfaced along the way.
- Gives both the mobile app and the web admin portal the same deliberate, documented session length, instead of each quietly running on whatever a library default happens to be.
- The scheme strings live in one place (`packages/shared`) instead of being duplicated, so a future new build variant cannot let the two files drift out of sync.

**Negative or tradeoffs**:
- This spec cannot promise **AC-1** is closed; it promises a real diagnostic instead of a second guess, meaning one more short round trip before the mobile fix is certain.
- A lost or borrowed, unlocked device stays signed in for up to 30 days of inactivity on either surface, with no remote "sign out everywhere" control; the device's own lock screen and, once built, account deletion are the only protections.
- Multiple concurrent sessions per person, on both surfaces, mean an old signed in device or browser keeps working until it goes 30 days idle or the account is deleted.
- Admin's elevated privileges get the same 30 day window as a visitor's mobile session, a deliberate tradeoff of friction against risk that the engineer chose explicitly rather than inheriting a shorter default by accident.

**Neutral**:
- No schema change and no data migration.
- Moving the scheme constant into `packages/shared` is a small refactor, not a behavior change on its own.
- The three mobile build variants stay cleanly separate from each other and from the web portal, since each has its own scheme or cookie origin; a session from one never appears in another.

## Follow-up

- [ ] If build step 2's diagnostic does not land on either listed branch, escalate with more logging before attempting a second fix; do not guess a third time.
- [ ] "Sign out of all other devices" and an admin forced remote sign out were both explicitly left out of this feature on the engineer's call. Revisit if a lost device report ever comes in before feature 8 (account deletion) ships.
- [ ] Automated test coverage for `convex/auth.ts`'s session config would mostly be testing the Better Auth library's own behavior rather than this project's logic; flag for `/test` to judge whether it is worth adding given testing is intentionally light at this layer.
- [ ] Feature 30 (Google sign in, in progress) and feature 8 (account deletion, planned) both go through this same session mechanism. No action needed now, just confirm neither reintroduces a session clearing bug when it ships.
