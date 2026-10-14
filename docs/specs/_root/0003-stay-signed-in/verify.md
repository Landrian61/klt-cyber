# Verify: stay signed in · spec 0003 · updated 2026-10-13
_Steps derived from spec 0003's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Diagnose on a preview APK: sign in, force-stop (not reinstall), relaunch, check whether the keychain still holds the session key and what `/get-session` answers → AC-1 (still open — needs a physical/emulated device)
- [ ] Sign out from the mobile app's Settings, then query the Better Auth sessions table directly for that session's row → row is actually gone, not only forgotten on the device → AC-3
- [ ] Sign out from the web portal, revisit the portal within minutes → redirected to sign-in, and the sessions table confirms the row is gone → AC-3
- [ ] Use a session more than 24 hours after it was created, then check its `expiresAt` value in the Better Auth sessions table → it moved forward rather than staying fixed → AC-2
- [ ] Sign in on a second device or browser with the same account; the first, left open, is still signed in when revisited → AC-5
- [ ] Close and fully reopen the web admin portal after signing in, revisit the portal link → lands directly on the signed-in area, no sign-in redirect → AC-6
- [ ] Put the mobile device in airplane mode before reopening the app → Home still renders immediately from the stored session, with no network round trip gating that first route decision → AC-4
- [ ] Send a request to a Better Auth endpoint with a cookie and a bogus `Origin` header (not `SITE_URL` or one of the three app schemes) → rejected by the origin check; the same request with `Origin: kltcyber://`, `kltcyber-dev://`, or `kltcyber-preview://` succeeds → confirms the `trustedOrigins` fix (Value sourcing: Trusted origin check)
- [ ] Once step 1/2's diagnostic lands on a branch and any resulting fix ships: repeat the mobile cold-launch happy path (sign in, fully close, reopen) on each build variant (development, preview, production) → AC-1

## Acceptance-criteria coverage
- AC-1 … diagnostic step + the final cold-launch happy-path step (both open, pending build plan steps 1–2)
- AC-2 … the 24h-expiry step
- AC-3 … the two sign-out steps (mobile, web)
- AC-4 … the airplane-mode step
- AC-5 … the multi-device step
- AC-6 … the web-reopen step
