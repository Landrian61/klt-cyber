# 0002. Error screens, Sentry, update channels

**Date**: 2026-10-09
**Status**: In Progress

## Summary

This is three related but separate decisions about making failure visible
and recoverable, grouped under one scope feature because they ship together
in Week 1. Error screens give every failed screen a friendly message and a
working retry instead of a blank page or a crash. Sentry reports those same
errors (and crashes) from mobile, web, and the backend, so problems surface
before a minister has to report one by word of mouth. Update channels turned
out to already be built while finishing feature 2 (staging and production
environments) a few days earlier, so that piece of this spec documents what
exists rather than designing something new.

## Structure

| Child spec | What it is | Supports |
|---|---|---|
| [0002-error-screens.md](0002-error-screens.md) | A shared `ErrorState` component + Sentry's own `ErrorBoundary`, wired on four representative screens (one query, one mutation, per app) | F5-06, NF-06, M1-04 |
| [0002-sentry-observability.md](0002-sentry-observability.md) | `@sentry/react-native` and `@sentry/nextjs` on their platforms; a hand rolled envelope POST helper for the Convex backend (no SDK fits its runtime, and the official Convex integration needs a paid plan this project isn't on) | F5-07, NF-13 |
| [0002-update-channels.md](0002-update-channels.md) | Already built: separate `staging`/`production` EAS Update channels, each bound to its own branch and its own automated CI publish. Documents what exists; no new design | F5-08, NF-14 |

**Cross child contract** (revised post cross check, 2026-10-09):
- 0002-error-screens.md's `Sentry.ErrorBoundary`/`Sentry.captureException`
  calls need Sentry initialized first to do anything beyond render their
  fallback — 0002-sentry-observability.md's SDK init steps (its Build plan
  steps 4 and 5) must land before 0002-error-screens.md's screen-wiring
  steps (its Build plan steps 5 and 6). This governs *verifying the
  reporting half*, not compilation — the boundary renders its fallback
  fine either way.
- Both children share the same four reference screens (Home, the mobile
  profile-completion submit step, the admin dashboard, admin profile
  verification) as their Tracer Bullet slice — but **backend (`reportError`)
  coverage of those four screens is not part of either child's build**.
  All four are query- or mutation-driven, and `reportError` can only be
  called from an action (see 0002-sentry-observability.md AC-3); none of
  the four reaches an action directly. Their backend-side failures are
  captured only via the client SDKs plus manual request-ID correlation to
  Convex's logs, not via `reportError`. Stated here so it isn't assumed
  solved by either child alone.
- Both children add a **native** mobile dependency
  (`@sentry/react-native`, `@react-native-community/netinfo`). Neither can
  reach an already-installed binary via OTA (`app.config.ts`'s
  `runtimeVersion: { policy: "fingerprint" }` enforces this) — a
  development-client rebuild and a fresh "Build (preview APK)" run are a
  shared precondition for verifying either child on a real mobile device.

## Requirements

Each child carries its own IDed acceptance criteria in its own
`## Requirements` section; this umbrella restates none of them. In SRS
terms, this feature closes: F5-06, F5-07, F5-08, M1-04, NF-06, NF-13, NF-14
(`docs/scope/scope.md` row 3).

## Decision

**Chosen shape**: three child specs under one umbrella, not one combined
spec and not three unrelated top level specs.

A combined spec would have mixed a genuinely new UI pattern, a genuinely new
third party integration, and documentation of work already shipped into one
file with three different reasoning shapes — exactly what `## Options
considered`/`## Rationale` apply to badly. Three unrelated top level specs
would have lost the one real dependency between them (error screens needs
Sentry's boundary already initialized) and the shared reference-screen
choice. The umbrella keeps each decision scannable on its own while keeping
the one thing that actually couples them, build order, in one place.

## Build plan

Sequencing across children (each child's own `## Build plan` has the detail):

1. 0002-sentry-observability.md steps 1 to 3: provisioning, Convex env
   vars, the backend `reportError` helper (action-only; not wired into the
   four reference screens, see Cross child contract)
2. 0002-error-screens.md steps 1 to 4: `ErrorState`, the connectivity hook,
   the dependency free final fallback, the retry cooldown — none of this
   depends on Sentry, can run in parallel with 1
3. 0002-sentry-observability.md steps 4 to 6: SDK initialization on mobile
   and web, `Sentry.setUser` wiring
4. 0002-sentry-observability.md step 7 + 0002-error-screens.md steps 5 and
   6, together: wrap the four reference screens' query paths in
   `Sentry.ErrorBoundary` with `ErrorState` as `fallback`; upgrade their
   mutation paths' existing local catch to call `Sentry.captureException`
   and render `ErrorState`
5. 0002-sentry-observability.md step 8: source maps and release tagging in
   CI, per surface's actual build mechanism
6. 0002-sentry-observability.md step 9 + 0002-error-screens.md step 7
   (shared): rebuild the mobile dev client and run "Build (preview APK)" —
   required to verify either child's native dependency on a real device,
   not optional polish
7. 0002-update-channels.md: nothing to build, already shipped

## Consequences

**Positive**:
- A failed screen is recoverable and reported, on both platforms, before
  launch (29 November 2026) — the actual goal behind F5-06/F5-07/M1-04.
- Reuses the per-environment configuration pattern (public `*_PUBLIC_*`
  vars, Cloudflare Build vs. Runtime variables, Convex deployment env vars)
  already established and proven in feature 2, rather than inventing a
  fourth variant.

**Negative / tradeoffs**:
- Both the UI pattern and backend reporting ship on a representative slice,
  not every screen/function — F5-06 and F5-07 read as "every screen"/"the
  backend", and this build plan does not reach full coverage. Tracked as
  Follow-up in both children, not silently dropped.
- The backend's Sentry integration is a hand rolled, action-only mechanism:
  it cannot reach queries or mutations at all (a Convex platform rule, not
  a gap in this design), which includes every function behind this
  feature's own four reference screens. Their backend-side failures rely on
  client capture plus manual log correlation, not automatic server side
  reporting — accepted because the alternative with real query/mutation
  coverage (Convex Pro) is a cost decision out of scope here.
- This feature ships two new native mobile dependencies
  (`@sentry/react-native`, `@react-native-community/netinfo`), so it cannot
  be verified on a real device via OTA alone — a binary rebuild is required
  first.

**Neutral**:
- Three new Sentry projects (mobile, admin, backend) to administer going
  forward.

## Follow-up

- [ ] Roll `ErrorState` + the boundary/local-catch pattern out to every
  remaining screen (0002-error-screens.md).
- [ ] Wire `reportError` into every remaining Convex **action** (queries and
  mutations are structurally excluded, see Cross child contract)
  (0002-sentry-observability.md).
- [ ] Revisit Convex Pro if adopted for other reasons; it's the only path
  that gives queries/mutations real server side coverage, which this
  build's action-only helper cannot reach (0002-sentry-observability.md).
- [ ] Resolve `@sentry/nextjs`'s server/edge instrumentation for OpenNext on
  Cloudflare Workers (client-only for this build) (0002-sentry-observability.md).
- [ ] Connect Sentry's official MCP server once events are flowing
  (0002-sentry-observability.md).
- [ ] Confirm OTA pickup against a real installed binary once one exists,
  likely during scope feature 21 (0002-update-channels.md).
- [ ] Confirm screen reader behavior for `ErrorState` (0002-error-screens.md).

## Rationale

Reasoning, options considered, and context for the umbrella shape itself:
see `rationale.md`. Each child's own decision reasoning lives inline in that
child file.
