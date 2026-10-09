# 0002. Sentry error and crash reporting

## Summary

Nothing in this codebase reports errors anywhere today (confirmed: no
mention of Sentry exists in the repo). This spec wires Sentry into mobile
and admin web with their official SDKs, client side. The Convex backend
cannot run any Sentry SDK (its default runtime forbids `fetch` outside
actions, by design, so mutations and queries cannot call out to anything),
and this project is on Convex's free plan, so the one officially supported
backend path (a Pro only, zero code integration) isn't available either.
Backend coverage for this build comes from the client SDKs' own capture,
matched to Convex's server logs by request ID, not from a server side
reporting call. Scope is errors and crashes only, no performance tracing or
session replay, and no personal information ever leaves the app beyond an
internal user ID.

## Context

F5-07/NF-13 require Sentry specifically (not "an error monitoring tool"),
across mobile, web, and backend. Sentry itself is therefore not an open
choice; how each surface integrates with it is.

Mobile (`apps/mobile`, Expo/React Native) and admin web (`apps/admin`,
Next.js) both have official, actively maintained Sentry SDKs with first
class framework support. The Convex backend does not, and the constraint
runs deeper than "no SDK fits the runtime": Convex queries and mutations are
required to be deterministic (no network calls of any kind, so Convex's
optimistic concurrency control can safely retry them), so `fetch` is only
ever available inside an **action**. A hand rolled reporting call is subject
to the exact same rule as a real SDK would be — it cannot run from a query
or a mutation either, full stop, regardless of how it sends the report.
Convex does offer an official, zero-code Sentry integration (basis: Convex
docs, Exception Reporting), but it is dashboard-configured server-side
infrastructure, not an SDK, and is gated to the Pro plan (basis: Convex
docs, Exception Reporting) — this project is on the free/starter plan,
confirmed by the engineer.

This is a Week 1, Track A feature (`docs/scope/scope.md` row 3), spanning
all three surfaces, so it is one decision made once and applied three ways,
not three independent integrations.

> ⚠️ Revision note (post cross check, 2026-10-09): the first draft of this
> spec wired a `reportError` helper into two named mutations
> (`memberProfiles:submitProfile`, `memberProfiles:verifyProfile`). That
> cannot work — both are mutations, and mutations cannot call `fetch`. This
> revision corrects the backend design: server side reporting is limited to
> actions and HTTP actions; queries and mutations get coverage only through
> what the client SDKs themselves capture (AC-3, below).

## Requirements

**User stories**:
- As the engineer running this project alone, I see errors and crashes from
  mobile and web in one place, and can trace a reported backend failure back
  to its Convex function and logs, before a minister reports one to me by
  word of mouth (F5-07, NF-13).
- As a church member, my name and email are never sent to a third party
  monitoring tool just because a screen failed.

**Acceptance criteria**:
- **AC-1**: `@sentry/react-native` is initialized client side in
  `apps/mobile` (`Sentry.wrap` around the root layout), tagged
  `environment=staging` on the `preview` build profile/`staging` channel and
  `environment=production` on the `production` profile/channel, from an
  explicit `EXPO_PUBLIC_SENTRY_ENVIRONMENT` value, not inferred at runtime.
- **AC-2**: `@sentry/nextjs` is initialized client side only in
  `apps/admin` (`instrumentation-client.ts`; no server or edge
  instrumentation — see Rationale), tagged `environment=staging` on the
  `klt-cyber` Cloudflare project and `environment=production` on
  `klt-cyber-prod`, from an explicit `NEXT_PUBLIC_SENTRY_ENVIRONMENT` value.
- **AC-3**: A `convex/lib/sentry.ts` helper (`reportError(ctx: ActionCtx, error, context)`)
  posts a Sentry envelope (the wire format Sentry's own SDKs use; a plain
  `fetch` POST, no SDK dependency) to the configured DSN's envelope
  endpoint. Its `ctx` parameter is typed to `ActionCtx` specifically so a
  query or mutation calling it fails to compile, not fails at runtime — it
  can only be called from an action or HTTP action. Queries and mutations
  (the large majority of `convex/*.ts`, including every function behind
  this feature's four reference screens) get **no server side report** in
  this build; their failures are captured client side only (AC-1/AC-2),
  tagged with the Convex request ID already present in the client error
  message (`[Request ID: …] Server Error`), which can be matched by hand to
  the server stack in the Convex dashboard's function logs. Full server
  side coverage of queries and mutations needs Convex Pro's integration
  (Follow-up), not this helper.
- **AC-4**: Every report, on every surface, carries the caller's Convex
  `users._id` when one exists, and nothing else about them — no email, no
  name, no free-form user object. Enforced by the helper's and both SDKs'
  type signatures (Feature design), not left to each call site's judgment.
- **AC-5**: A failure to reach Sentry itself (network error, bad DSN, quota
  exceeded) is always caught and discarded silently; it must never throw
  into the caller's own error path. An unset DSN disables reporting
  entirely rather than throwing (`enabled: !!DSN`).
- **AC-6**: `tracesSampleRate` and session replay are both off on every
  surface; only error/crash events are captured. `sendDefaultPii: false`
  explicitly set on both SDKs; IP address storage disabled in each Sentry
  project's own settings (a provisioning step, not code).
- **AC-7**: Releases are tagged and source maps uploaded so a Sentry stack
  trace resolves to real source, per surface's actual build mechanism (not
  a single shared mechanism — see Value sourcing, the three surfaces build
  three different ways):
  - Mobile: `EXPO_PUBLIC_SENTRY_RELEASE` (the commit SHA) is inlined at
    both binary build time and OTA publish time; OTA bundles additionally
    get their source maps uploaded after each `eas update` publish.
  - Admin web: the release is Cloudflare's own build commit SHA; source
    maps upload during the Cloudflare build itself.

## Options considered

### Option 1: Official SDKs everywhere, including a `"use node"` Convex action wrapping `@sentry/node`

Run backend error reporting through a Convex `"use node"` action (Convex's
escape hatch into real Node.js, not the default V8 isolate), using the
genuine `@sentry/node` package there.

**Pros**:
- The one surface using an SDK Sentry actually maintains for backend use
  cases, with its full feature set.

**Cons**:
- Still only covers actions, same ceiling as Option 2, for a heavier
  dependency; queries and mutations are unreachable either way, since the
  restriction is `fetch`-in-queries-and-mutations itself, not which library
  makes the call. No simpler than Option 2, strictly heavier.

### Option 2: Hand rolled envelope POST helper, action-only, official SDKs for mobile/web client capture (chosen)

One small `fetch`-based helper implementing just enough of Sentry's
envelope format to report an exception with a message, a stack, and tags
— callable only from actions/HTTP actions. Queries and mutations rely on
client side capture (the SDKs already being installed for AC-1/AC-2) plus
manual request-ID correlation to Convex's own logs.

**Pros**:
- One mechanism for every action, with no runtime restriction fighting it.
- No dependency that might not actually load in the isolate.
- Honest about the real ceiling (queries/mutations) instead of claiming
  coverage the mechanism cannot deliver.

**Cons**:
- Hand rolled and undocumented for Convex specifically; no automatic
  coverage of queries/mutations at all, only what client capture plus
  manual log correlation gives you. Materially weaker than Option 3.

### Option 3: Upgrade to Convex Pro, use the official dashboard integration

Pay for Convex Pro on both projects (`klt-cyber`, `klt-cyber-prod`) and
configure Sentry at Deployment Settings → Integrations: zero code, Convex's
own infrastructure forwards every uncaught exception (queries, mutations,
and actions alike) automatically.

**Pros**:
- Genuinely automatic coverage of every function kind, including queries
  and mutations, which Option 2 structurally cannot reach.

**Cons**:
- A real recurring cost, decided here as out of scope: the engineer
  confirmed the project is on the free plan today. Revisiting this is a
  Follow-up, not a blocker for this build.

## Decision

**Chosen option**: Option 2, action-only hand rolled envelope helper for the
backend (queries/mutations covered client side only, not server side);
official `@sentry/react-native` and `@sentry/nextjs` SDKs (client side) for
mobile and web.

**Implementation skills**: `sentry-react-native-sdk` (`getsentry/sentry-agent-skills`, `.agents/skills/sentry-react-native-sdk/`) · `sentry-nextjs-sdk` (`getsentry/sentry-agent-skills`, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

The backend's constraint is real and verified, not assumed: Convex's
default runtime forbids `fetch` outside actions as a hard platform rule
(not a library compatibility gap an SDK could route around), and the one
officially supported path that reaches queries and mutations too (the
dashboard integration) needs a paid plan this project isn't on. Given that,
Option 2 is honest about its ceiling where Option 1 would spend more code
to hit the same ceiling. `@sentry/nextjs`'s server/edge instrumentation is
also left out of AC-2 on purpose: it targets Node.js/edge server runtimes,
and this project's admin app runs on OpenNext over Cloudflare Workers, a
pairing `@sentry/nextjs`'s server instrumentation isn't built for; shipping
client-only avoids guessing at an unverified runtime pairing, at the cost
of not capturing middleware or true server-side failures (Follow-up).

## Feature design

**Data model sketch**: None. Sentry itself is the system of record (a prior
decision in this same feature, see index.md's Structure); no new Convex
table.

**State transitions**: Not applicable.

**API surface**: No new Convex query/mutation/action is exposed to clients.
`convex/lib/sentry.ts`'s `reportError` is an internal helper usable only
from actions/HTTP actions, not itself a callable client endpoint.

**Value sourcing**:
| Action | Value produced | Source |
|---|---|---|
| Mobile init (AC-1) | `environment` tag | `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, a new repo variable pair (`..._STAGING`/`..._PRODUCTION`), re-inlined at OTA publish time by each deploy workflow and set in each `eas.json` build profile for binary builds — mirrors the existing `EXPO_PUBLIC_CONVEX_URL` pattern exactly, not inferred from the profile at runtime |
| Mobile init (AC-1) | the DSN to post to | `EXPO_PUBLIC_SENTRY_DSN`, same dual placement as the environment tag above (repo variable for OTA, `eas.json` profile for binary) |
| Web init (AC-2) | `environment` tag | `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, a Cloudflare **Build** variable (not Runtime), one value per Cloudflare project |
| Web init (AC-2) | the DSN to post to | `NEXT_PUBLIC_SENTRY_DSN`, same placement as above |
| `reportError` (AC-3) | the DSN to post to | `SENTRY_DSN`, a Convex deployment env var, set once per deployment |
| `reportError` (AC-3) | `environment` tag | `SENTRY_ENVIRONMENT`, a new Convex deployment env var, set once per deployment |
| Every report (all surfaces) | `user` id | **client side**: a query already exposed for another purpose, `profile:getMyAccount` (or `getMyProfileStatus`), read once after sign in to call `Sentry.setUser({ id })`, and `Sentry.setUser(null)` on sign out. **Not** `requireUser`/`getCurrentUser` (those are server-only helpers; they resolve the id on the backend, which is a different, actions-only reporting path, not the client SDKs) |
| CI release tag, mobile (AC-7) | the release identifier | `EXPO_PUBLIC_SENTRY_RELEASE`, inlined at publish/build time from `GITHUB_SHA` (already available in both mobile deploy workflows) for OTA; from the EAS build's own commit metadata for a native build |
| CI release tag, web (AC-7) | the release identifier | Cloudflare's own build commit SHA (`WORKERS_CI_COMMIT_SHA` — admin is **not** built in GitHub Actions, so `GITHUB_SHA` does not exist for it; see `spec/DEPLOYMENT.md` §4.2) |
| Source map upload (AC-7) | org/project to upload into | `SENTRY_ORG`, `SENTRY_PROJECT` — new config, named here since nothing else named them: one pair per surface's Sentry project |

**Key invariants**:
- A Sentry send failure never propagates past `reportError`/the SDK's own
  error handling into the caller (AC-5) — observability must never become a
  second point of failure.
- No report, on any surface, ever carries an email address, a name, or a
  raw `Doc<"users">` object — enforced by typing, not convention (below).
- `reportError`'s first parameter is typed `ActionCtx`, not the broader
  `QueryCtx | MutationCtx | ActionCtx` union many Convex helpers accept, so
  a query or mutation calling it is a compile error, not a runtime surprise.

**Security model**: Not applicable as a new read/write surface (no new
Convex function is exposed). The real sensitivity is what leaves the system
in each report, enforced three ways: `reportError`'s second parameter is
typed as `{ userId?: Id<"users">; fn: string; tags?: Record<string, string> }`,
never a user document or free-form object, so passing the whole `user` by
mistake doesn't type-check; `sendDefaultPii: false` is set explicitly on
both SDK inits; and IP address storage is disabled in each Sentry project's
own settings (a provisioning step, listed in Build plan).

**Configuration required**:
- `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT`: mobile app's
  Sentry project DSN and environment tag, set in both `eas.json` profiles
  and as GitHub repo variables (`..._STAGING`/`..._PRODUCTION`) re-inlined
  at OTA publish time
- `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: admin web's
  Sentry project DSN and environment tag, Cloudflare Build variables, per
  project
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`: backend Sentry project's DSN and
  environment tag, Convex deployment env vars, per deployment
- `SENTRY_ORG`, `SENTRY_PROJECT`: the org/project source maps upload into;
  one pair per surface
- `SENTRY_AUTH_TOKEN`, scoped to `project:releases`, in **three separate
  places**, not one: a GitHub Actions secret (mobile OTA source map
  upload), a Cloudflare Build secret (admin web build), and an EAS
  environment variable (native binary builds — a GitHub secret does not
  reach EAS's own build servers)
- Prerequisite, not yet done: a Sentry org with three projects
  (`klt-cyber-mobile`, `klt-cyber-admin`, `klt-cyber-backend`) must exist
  before any DSN can be filled in — an external signup step, the same shape
  as the R2 bucket/token provisioning already done for feature 2

**Critical test scenarios**:
- Happy path: a thrown error during render on a wired query screen produces
  a Sentry event with the correct `environment` tag, the correct `user.id`,
  and no PII, verifies **AC-1**, **AC-2**, **AC-4**
- Failure case (query): a Convex query throws server side (e.g. a seeded
  validation failure) → the client SDK captures it with the request ID in
  the message → that request ID is found in the Convex dashboard's function
  logs for the matching deployment, verifies **AC-3** (the client-capture
  half)
- Failure case (action): an action calling `reportError` with a bad/missing
  `SENTRY_DSN` does not throw into its caller, verifies **AC-5**
- Config case: a release published through `deploy-staging.yml` and one
  through `deploy-prod.yml` produce distinct `environment` tags and
  distinct releases in Sentry; a Cloudflare build of `klt-cyber-prod`
  produces its own distinct release, verifies **AC-1**, **AC-2**, **AC-7**

## Build plan

1. Provisioning (external, one time): create the Sentry org and its three
   projects (`klt-cyber-mobile`, `klt-cyber-admin`, `klt-cyber-backend`);
   generate a `project:releases`-scoped auth token; disable IP address
   storage in each project's settings. No AC on its own, a prerequisite for
   every task below.
2. Set `SENTRY_DSN` / `SENTRY_ENVIRONMENT` on both Convex deployments
   (`superb-dog-305`, and `klt-cyber`'s prod deployment for staging),
   satisfies **AC-3** (config half)
3. Build `convex/lib/sentry.ts`'s `reportError` helper, `ctx: ActionCtx`
   typed, silent failure, satisfies **AC-3**, **AC-4**, **AC-5**. Wire it
   into any action (not query/mutation) this feature's build touches; name
   none here, since 0002-error-screens.md's four reference screens are all
   query/mutation driven and reach no action directly (see index.md's
   Structure note on this)
4. Initialize `@sentry/react-native` in `apps/mobile` (per the
   `sentry-react-native-sdk` skill): `Sentry.wrap` the root layout,
   `EXPO_PUBLIC_SENTRY_DSN`/`..._ENVIRONMENT` per profile in `eas.json` and
   as repo variables for OTA, `tracesSampleRate: 0`, replay disabled,
   `sendDefaultPii: false`, `enabled: !!DSN`, satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**
5. Initialize `@sentry/nextjs` client only in `apps/admin` (per the
   `sentry-nextjs-sdk` skill, `instrumentation-client.ts`, no server/edge
   config): `NEXT_PUBLIC_SENTRY_DSN`/`..._ENVIRONMENT` as Cloudflare Build
   variables on both `klt-cyber` and `klt-cyber-prod`, same
   tracing/replay/PII settings, satisfies **AC-2**, **AC-4**, **AC-5**, **AC-6**
6. After sign in, call `Sentry.setUser({ id })` from the client-side
   account query named in Value sourcing, on both platforms; `setUser(null)`
   on sign out, satisfies **AC-4**
7. Wrap both apps' four reference screens in `Sentry.ErrorBoundary` (shared
   build step with 0002-error-screens.md — do this alongside that spec's
   own screen-wiring steps, not twice), satisfies **AC-1**, **AC-2** (crash
   capture half)
8. CI/build wiring for AC-7: add `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`
   to both mobile GitHub workflows (OTA source map upload via
   `npx sentry-expo-upload-sourcemaps dist` after each `eas update`) and as
   an EAS environment variable (native builds); add the same three to both
   admin Cloudflare projects as Build secrets/variables; set
   `EXPO_PUBLIC_SENTRY_RELEASE`/the Cloudflare build SHA per surface,
   satisfies **AC-7**
9. Because step 4 adds a **native** dependency (`@sentry/react-native`),
   mobile verification needs a fresh development-client rebuild and a
   "Build (preview APK)" run — an OTA publish alone cannot carry a new
   native module to an already-installed binary (`app.config.ts`'s
   `runtimeVersion: { policy: "fingerprint" }` enforces exactly this). No
   separate AC; a precondition for actually verifying AC-1 on a device,
   not just in CI.

## Consequences

**Positive**:
- F5-07/NF-13 are met for mobile and web crash/error capture, and the
  backend gets action-level coverage plus a documented, if manual, path to
  trace a query/mutation failure back through Convex's own logs.
- The backend helper has zero recurring cost beyond Sentry's own free tier.

**Negative / tradeoffs**:
- **Queries and mutations get no automatic server side report at all** —
  the large majority of this app's backend surface, including every
  function behind this feature's own four reference screens. Client side
  capture plus manual request-ID correlation is materially weaker than
  Convex Pro's automatic coverage; stated plainly here rather than implied
  to be solved.
- `@sentry/nextjs` runs client only; a true server-side or middleware
  failure on the admin app is not captured until that's revisited
  (Follow-up).
- The envelope helper is unproven, undocumented-for-Convex code; if Sentry
  changes the envelope format, it breaks silently (AC-5 means it fails
  quiet, not loud) until someone notices events stop arriving.
- A new native mobile dependency means this feature cannot ship purely as
  an OTA update; it needs a binary rebuild to actually verify on device.

**Neutral**:
- Three new Sentry projects to administer (one per surface) instead of one;
  matches this project's existing per-surface-per-environment pattern
  (separate Convex projects, separate Cloudflare projects) rather than
  introducing a new organizing principle.
- `SENTRY_AUTH_TOKEN` now lives in three separate places (GitHub secret,
  Cloudflare Build secret, EAS environment variable) because the three
  surfaces build in three genuinely different places; not consolidatable
  without changing how one of those surfaces builds.

## Follow-up

- [ ] Revisit Option 3 (Convex Pro + the official dashboard integration) if
  the project ever adopts Pro for other reasons — it is the only path that
  gives queries and mutations real server side coverage; this build's
  action-only helper structurally cannot reach them.
- [ ] Resolve `@sentry/nextjs`'s server/edge instrumentation for the
  OpenNext-on-Cloudflare-Workers runtime (unresolved pairing, client-only
  for this build) — needed before middleware/server errors are captured.
- [ ] Connect Sentry's official remote MCP server (`mcp.sentry.dev`) once
  events are actually flowing — lets a later `/debug` session search and
  triage real Sentry issues directly. Not useful before then, declined for
  now rather than connected empty.
- [ ] Wire `reportError` into every Convex action this project has
  (queries/mutations excluded by design, see AC-3), beyond whatever this
  build's scope happens to touch.
