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

- [x] `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` → passes → general correctness (verified 2026-10-10, exit 0)
- [x] `pnpm exec tsc --noEmit -p apps/admin/tsconfig.json` → passes → general correctness (verified 2026-10-10, exit 0, ignoring a pre-existing unrelated stale `.next/dev/types` cache error for a not-yet-built `/media-admin` route)
- [x] `pnpm exec tsc --noEmit -p convex/tsconfig.json` → passes → general correctness (verified 2026-10-10, exit 0)
- [x] `pnpm --filter mobile lint` → passes → general correctness (verified 2026-10-10, exit 0)
- [x] `pnpm --filter admin build` → completes, including the Sentry-wrapped `next.config.ts` → general correctness (verified 2026-10-10 from a clean `.next` cache; Turbopack build + typecheck + static generation all green, 24 routes listed)

**Also run (real evidence, not originally itemized here):**
- `pnpm run test:convex` → 29/29 tests passing (verified 2026-10-10)
- `convex/lib/sentry.ts`'s `reportError`, exercised directly via a scratch script (no Convex runtime needed — the function only touches `fetch`/`process.env`): unset DSN resolves cleanly with no throw (1ms); malformed DSN resolves cleanly with no throw (0ms); a well-formed-but-unreachable DSN resolves cleanly with no throw after a real failed network attempt (186ms) — **AC-5 (backend) directly proven**, not inferred from code reading. A fourth call with the real `klt-cyber-backend` DSN got **HTTP 200** back from `https://o4512225003896832.ingest.de.sentry.io/api/4512231283163217/envelope/` — the envelope genuinely reached and was accepted by Sentry's real ingest endpoint (**AC-3 backend delivery mechanism proven live**; whether it renders correctly in the Sentry UI wasn't checked — no dashboard read access from this session).
- `pnpm admin` (real dev server, not just a build): booted clean in 2.5s, `GET /sign-in` → **200**, `GET /admin` → **307** (middleware correctly redirects unauthenticated access) — proves the app boots and serves real requests with the Sentry/error-screens wiring compiled in; dev server console had no errors/warnings beyond a pre-existing deprecation notice.

**Real defects found live, fixed in code (2026-10-10):**

1. The developer ran the real admin dev server offline (signed in) and hit Next's raw crash page ("This page couldn't load") instead of our `ErrorState`, with a logged `TypeError: fetch failed` / `ENOTFOUND <deployment>.convex.site`. Root cause: `app/layout.tsx`'s `RootLayout` called `getToken()` (a real network round trip, cookie → Convex JWT) directly, unwrapped, in the root server layout that wraps every route — so when that fetch failed, it crashed before React ever reached our `Sentry.ErrorBoundary`/offline handling, which only exist further down the tree. Fixed by wrapping the call in try/catch, falling back to `undefined` (the same first-paint state an unauthenticated visitor already takes).
2. Retesting, the developer still hit the same crash on `/admin`. Root cause: `app/(admin)/admin/layout.tsx` (and its twin `app/(admin)/system-admin/layout.tsx`) do their own unwrapped `fetchAuthQuery(api.profile.getMyAccount)` server-side on every render — this is the per-module role-authority check (AGENTS.md: "Route-group layouts ... verify the caller holds the specific role type"), so it can't simply fall back to "no account" (that would incorrectly bounce an already-authenticated, merely offline user to `/sign-in`) or render the shell past a check that never ran. Fixed by catching the network failure specifically and rendering `<ErrorState cause="offline" />` with no sidebar/shell — nothing privileged renders, no redirect, no fabricated auth state.
3. Separately, once the crash was gone, the dashboard was observed stuck on skeleton placeholders indefinitely while offline rather than showing the offline banner or full `ErrorState`. Root cause: `useIsOffline` (web) relied only on `navigator.onLine`, which reflects whether the OS reports a network interface up, not whether the backend is actually reachable (e.g. Wi-Fi connected to a router with no uplink still reports `true`) — exactly the gap AC-2 is meant to cover. Fixed by combining it with Convex's own `useConvexConnectionState().isWebSocketConnected` (the authoritative "can we reach the backend" signal), debounced 2.5s so a normal fast cold-connect doesn't flash the offline state on every page load.

4. `areas-of-service/page.tsx` had the same unguarded pattern three times over (its own account fetch, a departments-membership fetch, and a conditional clans fetch). Fixed the same way: each wrapped individually in its own try/catch returning the same offline fallback, taking care the redirect() calls that exist between them stay outside any try (redirect works by throwing a special digest-tagged error Next's router catches — a blanket try/catch around the whole function would have swallowed those too, silently breaking every redirect in this page).

`departments/[departmentId]/page.tsx` was deliberately left alone: it already has a try/catch (redirects to `/areas-of-service` on any error), so it was never the crashing pattern. Its single catch doesn't distinguish "offline" from "genuinely not authorized" (Convex masks server-thrown error messages in production, so message-matching to tell them apart would be fragile), but now that `areas-of-service/page.tsx` handles its own offline case correctly, an offline user redirected here lands somewhere that shows the right state anyway — just via one extra hop.

All four fixes confirmed via `pnpm exec tsc --noEmit -p apps/admin/tsconfig.json` and `pnpm --filter admin build` (both exit 0, 24 routes), and a live `pnpm admin` boot check (`/sign-in` → 200, `/admin` → 307, unchanged from before). **Not re-verified live**: re-triggering the original offline-while-signed-in scenario end-to-end, to confirm the dashboard now shows the offline banner/`ErrorState` rather than just "no longer crashing" or "no longer stuck," needs the same login + real-connectivity-toggle access this session doesn't have — still the developer's to confirm.

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
