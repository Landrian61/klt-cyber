# Verify: Error screens, Sentry, update channels · spec 0002 · updated 2026-10-09

_Steps derived from the three child specs' acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Steps marked ⏳ need a real Sentry DSN (provisioning pending) before they can actually be exercised — the code path is built and gated `enabled: !!DSN` either way._

## UI / manual

- [ ] On Home (mobile), force the `getCurrentThemes`/`listUpcomingEvents` query to throw (e.g. temporarily break the query) → `ErrorState` (generic) renders in place of a blank screen, with a "Try again" button → AC-1, AC-6 (0002-error-screens.md)
- [ ] On the admin dashboard, same forced-throw test on any `useAuthQuery` call → `ErrorState` renders via the page-level `Sentry.ErrorBoundary` → AC-1, AC-6 (0002-error-screens.md)
- [ ] Tap "Try again" on either of the above → the boundary remounts (key bump), the query re-subscribes, and if the underlying cause is gone the screen recovers → AC-3 query path (0002-error-screens.md)
- [ ] Tap "Try again" immediately a second time within 3 seconds → the button stays disabled; no second retry fires until the cooldown elapses → AC-5 (0002-error-screens.md)
- [ ] Turn off device/browser connectivity on Home (mobile) or the admin dashboard (web) **after** data has already loaded → a non-blocking `OfflineBanner` appears, existing content stays visible, and it clears on its own once connectivity returns → AC-2 (0002-error-screens.md)
- [ ] Turn off connectivity **before** any query has resolved (e.g. cold start offline) → the full `ErrorState` with `cause="offline"` renders instead of a blank/skeleton screen → AC-2 (0002-error-screens.md)
- [ ] On mobile, submit the profile-completion review (`review.tsx`) with the mutation forced to fail → the existing local catch renders `ErrorState` (generic) instead of plain error text, with the same draft args held; retry re-submits with those same args → AC-3 mutation path (0002-error-screens.md)
- [ ] On admin, approve a profile in Review Mode (`ReviewMode.tsx`) and on the single-profile review (`ProfileReviewClient.tsx`) with `verifyProfile` forced to fail → same `ErrorState` swap, retry re-invokes `handleApprove`/`handleVerify` with the held form state → AC-3 mutation path (0002-error-screens.md)
- [ ] Temporarily make `ErrorState` itself throw during render → the dependency-free final fallback (plain text, "Something went wrong...") still renders instead of a blank screen, on both the Home and admin-dashboard boundaries → AC-4 (0002-error-screens.md)

## Sentry (⏳ needs a real DSN — see Follow-up below)

- [ ] ⏳ Set `EXPO_PUBLIC_SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` to a real dev-project DSN, trigger one of the forced errors above → the event appears in the matching Sentry project within seconds, tagged with the correct `environment` and the signed-in user's `users._id` as `user.id`, and nothing else (no email/name) → AC-1, AC-2, AC-4 (0002-sentry-observability.md)
- [ ] ⏳ Sign out → trigger another error → the event carries no `user` context → AC-4 (0002-sentry-observability.md)
- [ ] ⏳ Set an invalid/unreachable DSN → the app behaves normally, no error surfaces from the Sentry call itself → AC-5 (0002-sentry-observability.md)
- [ ] ⏳ Check the Sentry project dashboard after some use → no performance transactions, no session replays recorded (both off) → AC-6 (0002-sentry-observability.md)
- [ ] ⏳ Publish once through `deploy-staging.yml` and once through `deploy-prod.yml` (or the EAS profiles directly) → each produces a distinct `environment` tag and release in Sentry; same check for a Cloudflare build of `klt-cyber-prod` → AC-1, AC-2, AC-7 (0002-sentry-observability.md)
- [ ] ⏳ After `SENTRY_AUTH_TOKEN` is set in GitHub Actions / Cloudflare Build / EAS, re-run a deploy → a Sentry stack trace from a real error resolves to real source, not minified code → AC-7 (0002-sentry-observability.md)

## Commands

- [ ] `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` → passes → general correctness
- [ ] `pnpm exec tsc --noEmit -p apps/admin/tsconfig.json` → passes → general correctness
- [ ] `pnpm exec tsc --noEmit -p convex/tsconfig.json` → passes → general correctness
- [ ] `pnpm --filter mobile lint` → passes → general correctness
- [ ] `pnpm --filter admin build` → completes, including the Sentry-wrapped `next.config.ts` → general correctness

## Acceptance-criteria coverage

- AC-1 (error-screens) · AC-1 (sentry-observability) — covered by the forced-throw steps above
- AC-2 (error-screens, offline) · AC-2 (sentry-observability) — covered by the connectivity toggle steps
- AC-3 (error-screens, both retry paths) — covered by the retry steps
- AC-4 (error-screens, final fallback) · AC-4 (sentry-observability, user id only) — covered by the forced-ErrorState-failure step and the sign-out step
- AC-5 (error-screens, cooldown) · AC-5 (sentry-observability, silent failure) — covered by the repeated-tap step and the invalid-DSN step
- AC-6 (sentry-observability, no tracing/replay/PII) — covered by the dashboard check step
- AC-7 (sentry-observability, release/source maps) — covered by the deploy steps, pending `SENTRY_AUTH_TOKEN`
- AC-1/AC-2/AC-3 (update-channels) — already proven in production per that child spec; nothing new to verify here

## Follow-up before the ⏳ steps are runnable

1. Create the Sentry org and its three projects (`klt-cyber-mobile`, `klt-cyber-admin`, `klt-cyber-backend`), generate a `project:releases`-scoped auth token, disable IP storage per project.
2. Fill in the real DSNs: `apps/mobile/eas.json` (`preview`/`production` profiles), `apps/admin` Cloudflare Build variables, `apps/mobile/.env.local` / `apps/admin/.env.local` for local dev, and `pnpm exec convex env set SENTRY_DSN "..."` / `SENTRY_ENVIRONMENT "..."` per deployment.
3. Add `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` as a GitHub Actions repo secret/variable, a Cloudflare Build secret, and an EAS environment variable.
4. Only then: rebuild the mobile dev client and run "Build (preview APK)" (required — `@sentry/react-native` and `@react-native-community/netinfo` are native dependencies an OTA update cannot carry to an already-installed binary).
