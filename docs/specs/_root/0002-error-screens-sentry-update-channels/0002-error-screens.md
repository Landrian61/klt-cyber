# 0002. Error screens (friendly failure states, web and mobile)

## Summary

Today a failed screen in either app shows a blank page or crashes outright —
there is no error boundary and no retry pattern anywhere in the codebase.
This spec adds one shared pattern: a cause aware `ErrorState` component,
used two ways depending on what failed. A render time failure (a broken
query, a JS crash) is caught by Sentry's own error boundary. A failed
mutation is caught where it already is, in the screen's own handler, since a
rejected promise in an event handler never reaches a React boundary at all
— both target screens here already catch their mutation errors locally. It
ships on four representative screens first (one query screen and one
mutation screen, per app) to prove the pattern end to end; rolling it out to
every remaining screen is tracked as follow up work, not built here.

## Context

No screen in either app (`apps/mobile`, `apps/admin`) has an error boundary
today. A thrown error from a Convex query (Convex functions throw rather
than return an error object) currently propagates uncaught during render:
React unmounts the tree and the user sees a blank screen on mobile, or
Next.js's generic unstyled error page on web. `apps/admin` already has
`loading.tsx` files for most routes (the loading state is handled), but zero
`error.tsx` files (the App Router's error boundary convention) anywhere —
confirmed by a direct search.

A failed **mutation** is a different shape of problem, confirmed while
reviewing both target screens: `apps/mobile/app/profile-completion/review.tsx`'s
`handleSubmit` and `apps/admin/app/(admin)/admin/verification/ReviewMode.tsx`
already wrap their `submitProfile`/`verifyProfile` calls in their own
try/catch, setting local error text on failure. That's not an oversight to
route through a boundary instead — a rejected `await mutation()` inside an
event handler is not a render error, so no error boundary (Sentry's or a
hand rolled one) ever sees it. The right fix for a mutation failure is to
report it and upgrade its existing local error display to `ErrorState`, not
to wrap it in a boundary that structurally cannot catch it.

M1-04 names poor connectivity as its own case worth a clear message. Convex's
`useQuery` keeps serving its last known value while offline rather than
erroring, so "offline" is a state to detect independently (a connectivity
check), not a failure `ErrorState`'s boundary half will ever be asked to
render for an already-loaded screen.

This is a Week 1, Track A feature (`docs/scope/scope.md` row 3) under the
project's Tracer Bullet approach: prove a thin, real, end to end slice
before widening it, rather than retrofitting every screen in one pass.

> ⚠️ Revision note (post cross check, 2026-10-09): the first draft treated
> query and mutation failures as one case, both caught by the same
> boundary, which doesn't hold — a boundary cannot see a mutation's
> rejection. This revision splits AC-1/AC-3 into a query path (boundary) and
> a mutation path (local catch, same `ErrorState` component, different
> wiring), fixes the offline detection semantics, and names exact files.

## Requirements

**User stories**:
- As a member using the mobile app on a poor connection, I see a clear
  message and a working retry, not a blank screen (M1-04).
- As anyone using either app, a failed screen tells me something went wrong
  and lets me try again, instead of leaving me on a blank page (F5-06, NF-06).

**Acceptance criteria**:
- **AC-1 (query/render path)**: Any error thrown while **rendering** a
  wired screen — a failed Convex query, or an unrelated JS exception — is
  caught by Sentry's `ErrorBoundary` component and renders the shared
  `ErrorState` fallback, never a blank screen or the platform's raw
  crash/error page.
- **AC-2**: Loss of network connectivity is detected independently of any
  request, using a null-tolerant check (mobile: NetInfo's `isConnected ===
  false || isInternetReachable === false`, treating `null`/unknown as
  online, not offline; web: `navigator.onLine`). On a screen that has
  already loaded data, offline shows a non-blocking banner, not a full
  takeover (Convex's `useQuery` keeps serving its last known value while
  offline — replacing a working screen with a full error state would be a
  regression, not a fix). The full `ErrorState` offline variant shows only
  when there is no data yet, or a pending action is blocked by it. The
  screen recovers on its own when connectivity returns, no manual retry
  needed for the offline case specifically.
- **AC-3 (retry semantics, split by path)**:
  - Query path: `ErrorState`'s retry remounts the failed subtree (a `key`
    bump) so Convex re-subscribes.
  - Mutation path: the screen's own existing catch block calls
    `Sentry.captureException` directly (no boundary involved), then renders
    `ErrorState` in place of its current local error text, using the exact
    same arguments already held in that component's state; retry re-invokes
    the same mutation with those same arguments.
- **AC-4**: If `ErrorState` or the boundary's own fallback throws, a minimal,
  dependency free, hardcoded final fallback still renders (plain text, no
  icons or shared components that could themselves fail) rather than a blank
  screen.
- **AC-5**: The retry button disables itself for a fixed 3 second cooldown
  after each tap (not growing on repeated taps), so a user cannot hammer a
  failing backend, or Sentry's event quota, by repeatedly tapping retry.
- **AC-6**: The pattern is wired on four representative screens in this
  build:
  - Mobile query case: Home, `apps/mobile/app/(tabs)/index.tsx`
  - Mobile mutation case: profile submission,
    `apps/mobile/app/profile-completion/review.tsx` (`handleSubmit`, calls
    `memberProfiles:submitProfile`)
  - Admin query case: the dashboard, `apps/admin/app/(admin)/admin/page.tsx`
  - Admin mutation case: profile verification, both
    `apps/admin/app/(admin)/admin/verification/ReviewMode.tsx` and
    `apps/admin/app/(admin)/admin/verification/[profileId]/ProfileReviewClient.tsx`
    (both call `memberProfiles:verifyProfile` and already have their own
    local catch/error state)

  Every other screen is out of scope for this build (Follow-up).

## Options considered

### Option 1: Hand rolled ErrorBoundary + manual Sentry calls

A plain React class component `ErrorBoundary` catching render errors, calling
`Sentry.captureException` by hand in `componentDidCatch`, rendering
`ErrorState` as its fallback.

**Pros**:
- No dependency on Sentry SDK internals; works even if Sentry is ever swapped
  out.

**Cons**:
- Two code paths (catch logic, report logic) that can drift out of sync; easy
  to add a new boundary and forget the Sentry call.

### Option 2: Sentry's own ErrorBoundary for render failures, local catch + direct capture for mutation failures (chosen)

Both `@sentry/react-native` and `@sentry/nextjs` ship a ready made
`Sentry.ErrorBoundary` component for render-time failures. For mutations,
which a boundary cannot see at all, use the local catch each screen already
has, calling `Sentry.captureException` directly from it.

**Pros**:
- Catching and reporting can never drift apart for the query/render case,
  it is one component.
- Honest about the one case (mutations) no boundary can ever cover, instead
  of a design that implies coverage it cannot deliver.

**Cons**:
- Two distinct wiring patterns to teach (boundary for render, local catch
  for mutations) instead of one — necessary, not a stylistic choice; a
  single unified mechanism does not exist for this split in React.

### Option 3: Per screen try/catch instead of a boundary, for everything

Wrap each screen's data fetching in try/catch and manage an error state
locally, no React error boundary at all, even for render-time failures.

**Pros**:
- One mechanism, no boundary concept to teach.

**Cons**:
- Does not catch a genuine render time crash (try/catch cannot); every
  screen reimplements its own version, the opposite of "one shared pattern".

## Decision

**Chosen option**: Option 2. Every screen's query/render path wraps in
`Sentry.ErrorBoundary` with `ErrorState` as its `fallback`; every screen's
mutation path keeps its existing local catch, upgraded to call
`Sentry.captureException` and render `ErrorState` inline. `ErrorState`
itself takes a `cause` (`offline` | `generic`) and a `retry` callback either
way — the component is shared, only how each path reaches it differs.

## Rationale

The project is already adopting Sentry in this same feature
(0002-sentry-observability.md), so the dependency Option 2 accepts for the
render-time case is one this project is taking on anyway, not a new one
introduced just for error screens. For the mutation case, no boundary based
option exists at all — the cross check that revised this spec confirmed a
rejected promise in an event handler is simply invisible to every React
error boundary implementation, including a hand rolled one, so Option 1
would not have avoided this split either. Reusing each screen's existing
local catch (both target screens already have one) is less new code than
inventing a parallel mutation-error mechanism.

## Feature design

**Data model sketch**: None. This is client side UI behavior layered over
existing Convex queries and mutations; no new Convex table, field, or index.

**State transitions**: `ErrorState` itself is stateless (it's a pure render
of whatever `cause` and `retry` it's given). The connectivity check
(`AC-2`) has two states, `online` / `offline` (with "unknown" treated as
`online`), driven by the platform's own network events.

**API surface**: None. No new Convex functions. The pattern wraps existing
screens' existing `useQuery`/`useMutation` calls.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Rendering `ErrorState` | which cause (`offline` vs `generic`) | `offline`: the connectivity hook's current state (null-tolerant, see AC-2), checked before and independent of the boundary. `generic`: anything reaching the boundary (query path) or the local catch (mutation path) |
| Rendering `ErrorState` | the copy and icon shown | a small fixed copy map inside the component, keyed by `cause`; exact wording is a `/develop` detail, not dictated here |
| Retry (query case) | re-subscribing the failed subtree | remount via a `key` bump on the boundary's child, forcing Convex's `useQuery` to resubscribe |
| Retry (mutation case) | replaying the failed call | the same mutation reference plus the same arguments object already held in the component's own state (both target screens already hold this, since they already build the mutation's input before calling it) |

**Key invariants**:
- `ErrorState` and its final fallback (AC-4) never themselves make a network
  call or read a Convex hook — they must be renderable with zero
  dependencies, or a failure there has no safety net left.
- The offline check always wins over the generic case, but never replaces a
  screen that already has data to show (AC-2) — a user should never see
  "something went wrong, retry" when the real problem is connectivity, and
  never lose a working, already-loaded screen just because connectivity
  blipped.

**Security model**: Not applicable. Error screens render in response to
existing queries/mutations whose own authorization is unchanged; no new
read/write surface is introduced.

**Configuration required**: None for this child spec beyond what
0002-sentry-observability.md already names. `@react-native-community/netinfo`
is a new mobile dependency (no new env var or secret) — and, like
`@sentry/react-native`, a **native** module: see Build plan step 6.

**Critical test scenarios**:
- Happy path: Home loads normally, no error UI ever renders, verifies **AC-1**
- Failure case (mutation): `verifyProfile` throws server side (e.g. a
  validation error) → `ReviewMode.tsx`'s existing catch fires →
  `Sentry.captureException` is called → `ErrorState` (generic) renders in
  place of the old plain error text, with the review's in-progress
  edits/args intact → tapping retry re-calls `verifyProfile` with the same
  arguments, verifies **AC-3** (mutation path)
- Offline case: device goes offline mid session on Home, which already has
  data loaded → a non-blocking banner appears, the existing content stays
  visible, and it clears on its own once connectivity returns, verifies
  **AC-2**

## Build plan

Depends on `0002-sentry-observability.md`'s SDK initialization (steps 4 to
6 there) landing first — `Sentry.ErrorBoundary` and `Sentry.captureException`
both need Sentry initialized to do anything beyond rendering their fallback.

1. Build `ErrorState` (web: `apps/admin/components/ui/`, mobile:
   `apps/mobile/components/`) — takes `cause` and `retry`, renders per the
   Kingdom Radiant design system (no raw white/`#FFFFFF` except an elevated
   card, warm near-black text, no 1px structural borders), satisfies **AC-1**, **AC-2**
2. Build the connectivity hook (`useIsOffline` or equivalent), null-tolerant
   per AC-2 — web via `navigator.onLine`, mobile via
   `@react-native-community/netinfo` (new native dependency) — satisfies **AC-2**
3. Build the dependency free final fallback (plain text, no imports from
   `ErrorState` or the design system) for the boundary's own failure case,
   satisfies **AC-4**
4. Add the 3 second retry cooldown to `ErrorState`, satisfies **AC-5**
5. Wrap Home (mobile) and the admin dashboard (web) in `Sentry.ErrorBoundary`
   with `ErrorState` as `fallback`, wire query-case retry (remount via `key`),
   satisfies **AC-1**, **AC-3** (query half)
6. Upgrade the existing local catch in `review.tsx`'s `handleSubmit`,
   `ReviewMode.tsx`, and `ProfileReviewClient.tsx` to call
   `Sentry.captureException` and render `ErrorState` instead of plain error
   text; wire retry to re-invoke the same mutation with the args already
   held there, satisfies **AC-3** (mutation half)
7. Because step 2 adds a native dependency (`@react-native-community/netinfo`),
   same as `@sentry/react-native` in the companion spec: mobile
   verification needs a development-client rebuild and a fresh "Build
   (preview APK)" run, not just an OTA publish. No separate AC; shared
   precondition with 0002-sentry-observability.md's step 9.

## Consequences

**Positive**:
- F5-06/NF-06/M1-04 are met on the four screens that most visibly represent
  "a screen failed" for a typical member and a typical admin, with each
  failure kind (render vs. mutation vs. offline) handled the way it
  actually behaves, not a one-size-fits-all mechanism papering over the
  difference.
- The shared `ErrorState` component is reusable with zero new code for
  every screen rolled out afterward (Follow-up); only the per-path wiring
  (boundary, or upgrade an existing catch) repeats.

**Negative / tradeoffs**:
- Every screen besides the four wired here still shows the old blank/crash
  behavior until rolled out — F5-06 literally says "every screen", which
  this build does not yet satisfy in full.
- Two wiring patterns (boundary for render, local-catch upgrade for
  mutations) instead of one mean a future screen's author has to know which
  applies, not just "wrap it".
- This feature now ships a native mobile dependency, so it cannot verify on
  a real device via OTA alone — a fresh binary build is required first.

**Neutral**:
- `@react-native-community/netinfo` is a new, actively maintained Expo
  compatible dependency; no equivalent is needed on web.

## Follow-up

- [ ] Roll the pattern out to every remaining screen: wrap render paths in
  the boundary, upgrade existing mutation catch blocks the same way step 6
  did here. Purely mechanical once the four reference screens exist.
- [ ] `apps/admin/app/(admin)/admin/page.tsx`'s dashboard has a known,
  separately tracked bug (scope feature 18, A1-03: the recent-activity card
  errors for non-System Admins). Once this spec's boundary exists there,
  fixing A1-03 becomes straightforward — but fixing it is feature 18's work,
  not this spec's.
- [ ] Confirm screen reader behavior (an `aria-live` region on web, an
  accessible announcement on mobile) when `ErrorState` mounts; not specified
  in the SRS for this feature, worth a deliberate pass rather than an
  accidental silence.
