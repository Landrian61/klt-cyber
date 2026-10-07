# 0001. Production readiness and safe seeding

**Date**: 2026-10-03
**Revised**: 2026-10-05, facility visibility decided (AC-8, Decision); the Status line is unchanged
**Status**: In Progress

## Summary

This spec fixes how the project's seed scripts decide what is safe to write, and designs the guard that will stop sample data or an accidental admin grant from ever reaching production. The production Convex project itself does not exist yet and its creation is deliberately deferred past this feature (the engineer's call); what ships now is the code-side safety net plus a clear runbook for everything that still needs standing up later. A real bug is fixed along the way: today's content seed silently hands out a System Admin role every time it runs, which the requirements say it must never do.

> ⚠️ Premise note: The scope row for this feature (`docs/scope/scope.md` #2) bundles four separable decisions: the seed safety guard (buildable now), the backup mechanism, branch protection for "Andrew alone" deploys, and the full production account/environment stand up (domain, Resend, Google OAuth, Africa's Talking, Apple/Google developer accounts, Cloudflare, EAS, R2). The engineer confirmed production stand up is deferred past this feature. This spec narrows to the one decision with real design content: the seed guard and content split. The other three are already decided in this conversation (parameters recorded below) but have no remaining design work, only execution later, so they are recorded as `## Follow-up` rather than forced into this spec's `## Options considered` / `## Decision`.

## Context

Convex has no environment concept of its own beyond a project's `dev` and `prod` deployment slots. Today the project has exactly two live deployments: each developer's local `dev` deployment, and the `klt-cyber` project's `prod` slot, which `spec/DEPLOYMENT.md` explicitly uses as **staging** until a dedicated production project exists. A seed script that checked Convex's own dev/prod label would misread today's staging deployment as production and block legitimate staging sample-seeding — the exact failure this feature exists to prevent, just aimed at the wrong target.

Three seed files exist. `convex/seed.ts` (`clans`, `departments`, `bootstrapSystemAdmin`) is already safe everywhere: idempotent, no sample data, and the only role grant is gated behind `SEED_ADMIN_EMAIL`. `convex/contentSeed.ts` and `convex/churchAdminSeed.ts` are not: `contentSeed.ts`'s `seedContent` unconditionally grants an active `system_admin` role to whoever it resolves as the actor, and both files insert sample content (fake themes, events, announcements, facilities, member profiles) with nothing stopping either from running against any deployment, including a future production one.

`spec/SRS.md` F5-03 requires production to receive only reference data (the 12 clans, 13 departments, radio programs, and Tower of Faith facility names as hidden drafts) and states, without qualification, that "the content seed never grants roles." NF-16 requires staging to mirror production and get sample data, and production never to. Until a dedicated production Convex project exists, there is nothing to protect yet — but the guard mechanism and the content split need designing and building now so they are inert-but-ready, not invented under time pressure once production is finally stood up.

## Requirements

**User stories**:
- As the platform owner, I want the content seed to never grant a role, so that re-running it can never silently create an unintended administrator.
- As the platform owner, I want a seed function that is safe to run against any deployment including production, so that production starts with real reference data (clans, departments, the bootstrap admin, facility names, and the recurring weekly programs) without any manual data entry.
- As the platform owner, I want sample-only content blocked from ever reaching production, so that a mistaken command can't pollute production with fake visitors, events, or announcements.

**Acceptance criteria** (the contract, each criterion is independently checkable):
- **AC-1**: `contentSeed.ts`'s seed mutation never inserts a `roleAssignments` row, in any environment, on a fresh run or a re-run. (F5-03)
- **AC-2**: Both sample-data seed mutations (`contentSeed:seedContent`, `churchAdminSeed:seedChurchAdmin`) require an explicit `allowSampleData: true` argument AND check the production guard before writing anything; they throw a clear error with no writes if `allowSampleData` is not `true`, or if the guard reports production regardless of the argument (defense in depth: an operator must deliberately opt in, not just rely on the URL check). (F5-03, NF-16)
- **AC-3**: A seed function inserts the three Tower of Faith facilities (KLT Media Studio, KLT Resource Library, KLT Fellowship Hall) as hidden drafts — name only, `active: false`, attributed to the `SEED_ADMIN_EMAIL` user — and is safe to run in every environment including production; re-running it inserts only if absent by `name` with no duplicates; it returns `{ ok: false, reason }` and writes nothing if the `SEED_ADMIN_EMAIL` user doesn't exist yet. (F5-03)
- **AC-4**: The five recurring weekly programs (Sunday Service, Women's Fellowship, Mid-Week Service, Eagles Youth Cell, Tongues of Fire) seed from a function with no production guard (they are real content, not sample data, per the engineer's call), attributed to the `SEED_ADMIN_EMAIL` user, idempotent on `title`, written onto the current recurrence fields (`recurrence: "weekly"`, `daysOfWeek`, `startDate`, `startTime`) — never the deprecated `dayOfWeek`/`time` pair, and never `coverImageUrl` (today's values are Unsplash placeholders that don't belong in production). It returns `{ ok: false, reason }` and writes nothing if the `SEED_ADMIN_EMAIL` user doesn't exist yet. (F5-03, engineer judgment call)
- **AC-5**: The remaining sample-only content (themes, events, announcements) stays behind the AC-2 guard in `contentSeed.ts`; nothing else changes about what it seeds. (F5-03)
- **AC-6**: The guard's production check is a constant that starts empty (a clear placeholder, documented as inert), so AC-2 is correct but dormant until a real production Convex project exists and someone fills it in — this is deliberate, not a gap, per the Follow-up below. (NF-16)
- **AC-7**: `seed.ts:facilityDrafts` and `churchAdminSeed.ts:seedChurchAdmin` can run in either order against the same deployment without one suppressing the other's writes: `seedChurchAdmin`'s already-seeded check keys off the seed user existing, never off any facility existing, and both functions insert facility rows only if absent by `name`. (idempotency correctness, caught in cross check)
- **AC-8**: Every facility row either seed creates is hidden (`active: false`), whichever seed runs first, so the three Tower of Faith facilities are never visible to members from a seed alone. A seed never modifies a facility row that already exists, so rows created before this rule (legacy `active: true` rows) are left as they are. (F5-03, decided 2026-10-05)

## Options considered

### Option 1: No code change, rely on operator discipline

Keep every seed script as is; document in `spec/DEPLOYMENT.md` that no one should run `contentSeed`/`churchAdminSeed` against production once it exists.

**Pros**:
- Zero build cost right now.

**Cons**:
- Does not fix the unconditional role-grant bug, which is a requirement violation today, independent of production even existing.
- A documented rule with no enforcement is exactly the failure mode F5-03/NF-16 are written to prevent; one tired `pnpm exec convex run` against the wrong deployment and production has fake visitors and an accidental admin.

### Option 2: An explicit `ENVIRONMENT` Convex env var

Set `ENVIRONMENT=production|staging|development` on each deployment; every seed function reads it and refuses unsafe seeds when it reads `production`.

**Pros**:
- Simple to read, no hardcoded URL to maintain.
- Immune to any future change in how Convex's own dev/prod labeling works.

**Cons**:
- One more env var to remember to set correctly on every new deployment, including the current staging deployment (today's staging is Convex's own `prod` slot, so "set `ENVIRONMENT` everywhere, including deployments that already exist" is one more manual step than the alternative).
- The engineer considered this and preferred not adding a new env var for a condition code can check directly from what Convex already injects (see chosen option below).

### Option 3: A hardcoded production URL constant, compared at runtime (chosen)

A single source constant (not a secret, not an env var) holding the real production deployment's `*.convex.cloud` URL, starting empty. The guard compares `process.env.CONVEX_CLOUD_URL` (auto-injected by Convex on every deployment) against that constant; it never looks at Convex's own dev/prod label, which today would misidentify staging as production.

**Pros**:
- No new env var to set correctly on every deployment; the constant is a one-line code change the day the production project is created.
- Correct today and correct after production exists, by construction: an empty constant can never equal a populated `CONVEX_CLOUD_URL`, so the guard is accurately "always false" until deliberately turned on.

**Cons**:
- The guard is genuinely inert until a human remembers to fill in the constant; this is accepted deliberately (AC-6, Follow-up), not hidden.
- Convex URLs are public by design (already baked into client bundles elsewhere per `spec/DEPLOYMENT.md` §3.1), so there is no secrecy requirement being broken by this being a committed constant rather than a secret.

## Decision

**Chosen option**: Option 3: A hardcoded production URL constant, compared at runtime, plus an explicit opt-in argument.

A new `convex/lib/environment.ts` exports `PRODUCTION_CONVEX_URL` (an empty string placeholder) and `isProductionDeployment(url = process.env.CONVEX_CLOUD_URL, prodUrl = PRODUCTION_CONVEX_URL)`, which trims a trailing slash from both and returns `url === prodUrl && prodUrl !== ""`. `contentSeed.ts` and `churchAdminSeed.ts` both also take a required `allowSampleData: true` argument. Each guarded mutation throws before any write unless `allowSampleData` is `true` AND `isProductionDeployment()` is `false` — a second, independent layer added after the cross check flagged that the URL check alone fails open on a typo'd constant.

**Argument and return contract (clarified 2026-10-05)**: both sample seeds declare `allowSampleData` as `v.optional(v.boolean())`, so a missing argument reaches the handler and gets the same clear refusal as `false`. Refusals return or throw with the message "pass allowSampleData: true to confirm". The two admin-dependent seeds return `{ ok: false, reason: "SEED_ADMIN_EMAIL not set" }` when the env var is empty or missing, and `{ ok: false, reason: "no SEED_ADMIN_EMAIL user yet" }` when the user is absent. Success returns `{ ok: true, created, total }`. `daysOfWeek` uses the schema's encoding: numbers 0 to 6, where 0 is Sunday. `weeklyPrograms` pins each program's `startDate` to a fixed Kampala-midnight date on its weekday (Sunday Service 4 Jan 2026, Women's Fellowship 5 Jan, Mid-Week Service 7 Jan, Eagles Youth Cell 8 Jan, Tongues of Fire 9 Jan), so every run writes the same value.

**Facility visibility (revised 2026-10-05)**: the three Tower of Faith facilities are hidden drafts whichever seed creates them. Both `seed.ts:facilityDrafts` and `churchAdminSeed.ts:seedChurchAdmin` insert them with `active: false`, and both insert only if absent by `name`, so a row that already exists is never modified by a seed. The alternatives were to have `facilityDrafts` patch existing rows to hidden (which would also hide facilities Real Estate has published) or to leave visibility to whoever edits the facility. The engineer chose to make `churchAdminSeed` insert drafts as well, so the outcome no longer depends on which seed runs first.

## Rationale

Option 1 is rejected outright: it leaves a requirement-violating bug (the unconditional role grant) unfixed, and "a rule nobody enforces" is the precise anti-pattern F5-03 and NF-16 exist to close off. Between Options 2 and 3, the deciding force from Context is that Convex already injects `CONVEX_CLOUD_URL` into every deployment for free — Option 3 spends that for a guard with one less manually-set variable than Option 2, at the cost of the constant needing a one-line edit once production exists, which is already tracked as a Follow-up item regardless of which option was chosen. The engineer weighed this tradeoff directly and chose Option 3, having been shown the specific staging/prod-label gotcha that ruled out the naive "check Convex's own dev/prod flag" version of this idea. A cross check of this spec (a second model, read only) flagged that Option 3 fails open: a typo or stale value in `PRODUCTION_CONVEX_URL` leaves the guard silently inactive with no warning. The `allowSampleData: true` requirement closes that gap at negligible cost (one more argument, not one more deployment env var), so both sample seeds now need two independent conditions to actually write, not one.

## Feature design

**Data model sketch**:
No new tables or fields. `facilities.active` (existing `v.boolean()`) already supports a hidden draft row. A draft row sets `name`, `active: false`, and the required audit fields `createdBy`, `createdAt`, `updatedAt`; every other field on that table is optional and left unset by `facilityDrafts`. `churchAdminSeed` keeps its sample fields (tagline, description, services, contacts, image) on the rows it inserts, and only changes `active` to `false`.

**API surface** (these are `internalMutation` seed functions, never called by a client — triggered only via `pnpm exec convex run <name>` by whoever holds deploy credentials for that deployment):

| Function | Change | Guarded (AC-2) | Key behavior |
|---|---|---|---|
| `seed.ts:clans`, `seed.ts:departments`, `seed.ts:bootstrapSystemAdmin` | none | no (already safe everywhere) | unchanged |
| `seed.ts:facilityDrafts` | new | no (safe everywhere) | inserts KLT Media Studio, KLT Resource Library, KLT Fellowship Hall as hidden drafts (`active: false`, name only), attributed to `SEED_ADMIN_EMAIL`; inserts only if absent by `name`; refuses if that user doesn't exist |
| `seed.ts:weeklyPrograms` | new (extracted from `contentSeed.ts`) | no (real content, per engineer) | inserts the 5 recurring programs onto the current recurrence fields, attributed to `SEED_ADMIN_EMAIL`; idempotent on `title`; refuses if that user doesn't exist |
| `contentSeed.ts:seedContent` | changed | yes (`allowSampleData: true` + guard) | drops the weekly-programs block (moved above) and the automatic role grant (AC-1); keeps themes/events/announcements, now guarded and requires the explicit opt-in argument |
| `churchAdminSeed.ts:seedChurchAdmin` | changed | yes (`allowSampleData: true` + guard) | unchanged content (sample facilities + member profiles); already-seeded check now keys off the seed user, not "any facility exists"; facility inserts insert only if absent by `name` so it can't collide with `facilityDrafts`, and insert with `active: false` (hidden drafts, AC-8) |

**Value sourcing**:

| Action | Value produced | Source |
|---|---|---|
| `seed.ts:facilityDrafts`, `churchAdminSeed.ts:seedChurchAdmin` | facility `name` (×3: KLT Media Studio, KLT Resource Library, KLT Fellowship Hall) | hardcoded list, reused from `churchAdminSeed.ts` |
| `seed.ts:facilityDrafts`, `churchAdminSeed.ts:seedChurchAdmin` | facility `active` on insert | the constant `false` (hidden draft, AC-8); never written on a row that already exists |
| `seed.ts:facilityDrafts`, `seed.ts:weeklyPrograms` | `createdBy`, `createdAt`, `updatedAt` (both tables require all three) | `createdBy`: the `SEED_ADMIN_EMAIL` user, looked up by email; the function refuses and writes nothing if that user doesn't exist yet. `createdAt`/`updatedAt`: `Date.now()` at insert time |
| `seed.ts:weeklyPrograms` | program `title`/`description`/`recurrence`/`daysOfWeek`/`startDate`/`startTime` (×5) | the existing program list in `contentSeed.ts`, rewritten onto the current recurrence fields: `recurrence: "weekly"`, `daysOfWeek: [<old dayOfWeek>]`, `startTime: <old time>`, a real `startDate`; no `endTime`, no `coverImageUrl` |
| guard check (both guarded functions) | the production/non-production verdict | `isProductionDeployment(url = process.env.CONVEX_CLOUD_URL, prodUrl = PRODUCTION_CONVEX_URL)`, a pure function trimming a trailing slash from both sides before comparing (keeps it unit-testable without touching real env vars) |
| guard check (both guarded functions) | the explicit opt-in | the mutation's own `allowSampleData: true` argument, required in addition to the URL check (cross check's defense-in-depth fix: the URL check alone fails open on a typo'd constant) |

**Key invariants**:
- No seed function ever grants a role except `bootstrapSystemAdmin`, and only to the single `SEED_ADMIN_EMAIL` user.
- Every seed function stays idempotent: re-running any of them must not duplicate rows or re-grant anything already granted.
- A guarded function must throw before its first `ctx.db.insert`/`ctx.db.patch` whenever `allowSampleData` is not `true`, OR the guard reports production — whichever fails first, no partial writes.
- `seedChurchAdmin`'s already-seeded check keys off the seed user (`grace.nakato@seed.kltcyberchurch.org`) existing, never off any facility existing, so it cannot be short-circuited by `facilityDrafts` running first; both functions insert facility rows only if absent by `name`, so either order is safe (AC-7).
- `facilityDrafts` and `weeklyPrograms` refuse and write nothing if the `SEED_ADMIN_EMAIL` user doesn't exist yet — never silently attribute to an arbitrary "first user" the way the existing sample seeds do.
- Any facility row a seed inserts has `active: false` (AC-8). A seed never patches an existing facility row, so visibility changes stay with whoever edits facilities.

**Security model**:
Unchanged. Seed functions are `internalMutation`s, unreachable from any client; running one requires Convex deploy credentials for that specific deployment, which `AGENTS.md` already restricts to Andrew for production.

**Configuration required**:
- `PRODUCTION_CONVEX_URL` (code constant in `convex/lib/environment.ts`, not a Convex env var, not a secret — Convex URLs are public by design): starts as an empty string; Follow-up fills it in with the real `*.convex.cloud` URL once the production project exists.

**Critical test scenarios**:
- Guard unit tests: `isProductionDeployment(url, prodUrl)` called directly as a pure function — equal URLs → `true`; equal except a trailing slash → `true`; `prodUrl` unset (today's real state) → `false`; `url` unset (e.g. under the test runner, where `CONVEX_CLOUD_URL` isn't set) → `false`. Verifies **AC-6**.
- Happy path: with a `SEED_ADMIN_EMAIL` user present, running `seed:facilityDrafts` and `seed:weeklyPrograms` against the dev or staging deployment, in either order relative to `seedChurchAdmin`, inserts the expected rows once each; a second run of any of them inserts nothing new. Verifies **AC-3**, **AC-4**, **AC-7**.
- Visibility: on a fresh deployment, run `seedChurchAdmin` first, then `facilityDrafts`, and the reverse order on another fresh deployment; in both, every facility row reads `active: false`. Verifies **AC-8**.
- Failure case: calling `seedContent`/`seedChurchAdmin` with `allowSampleData` omitted or `false` refuses with no writes. The production branch is tested on `assertSampleSeedAllowed` with explicit URL arguments, because `PRODUCTION_CONVEX_URL` is a constant that `vi.stubEnv` cannot reach. Verifies **AC-2**, **AC-6**.
- Missing admin: calling `facilityDrafts` or `weeklyPrograms` before `bootstrapSystemAdmin` has run (no `SEED_ADMIN_EMAIL` user yet) returns `{ ok: false }` and writes nothing. Verifies **AC-3**, **AC-4**.
- Regression: running `seedContent` (with `allowSampleData: true`, non-production) twice never adds a `roleAssignments` row, verifies **AC-1**.

## Build plan

1. Add `convex/lib/environment.ts`: `PRODUCTION_CONVEX_URL` (empty placeholder, with a comment pointing at this spec's Follow-up) and `isProductionDeployment(url = process.env.CONVEX_CLOUD_URL, prodUrl = PRODUCTION_CONVEX_URL)`, trimming a trailing slash from both before comparing. Satisfies **AC-2**, **AC-6**.
2. Add `seed.ts:weeklyPrograms`: extract the 5-program list out of `contentSeed.ts`, attribute to the `SEED_ADMIN_EMAIL` user (refuse with `{ ok: false }` if absent), rewrite onto `recurrence`/`daysOfWeek`/`startDate`/`startTime` (drop `coverImageUrl`), idempotent on `title`. Satisfies **AC-4**.
3. Add `seed.ts:facilityDrafts`: insert the 3 named Tower of Faith facilities as hidden drafts (`active: false`), attributed to the `SEED_ADMIN_EMAIL` user (refuse if absent), insert only if absent by `name`. Satisfies **AC-3**.
4. Fix `contentSeed.ts`: delete `ensureContentAdmin` and its call site (the role grant), remove the now-extracted weekly-programs block, add a required `allowSampleData: true` argument, wrap the remaining handler body in the Step 1 guard. Satisfies **AC-1**, **AC-2**, **AC-5**.
5. Fix `churchAdminSeed.ts:seedChurchAdmin`: add the same `allowSampleData` argument and guard; change its already-seeded check to key off the seed user (`grace.nakato@seed.kltcyberchurch.org`) instead of any facility existing; make its facility inserts insert only if absent by `name`, with `active: false` (AC-8). Satisfies **AC-2**, **AC-7**, **AC-8**.
6. Add automated tests: `isProductionDeployment` and `assertSampleSeedAllowed` as pure functions (equal URLs, trailing-slash variants, unset URL, production branch); both guarded mutations refusing without `allowSampleData`; idempotency and order-independence of the two safe-everywhere functions; the missing-admin and unset-env refusal paths; the hidden-draft visibility rule, including an existing active row left unchanged. Satisfies **AC-1** through **AC-8**, per this project's Beta-tier `/test` expectation.

## Consequences

**Positive**:
- The day a production Convex project exists, it can be seeded with real reference data (clans, departments, bootstrap admin, facility name drafts, weekly programs) and nothing else, in one safe pass.
- The unconditional role-grant bug is gone regardless of when production is stood up — this fix doesn't wait on Follow-up.

**Negative / tradeoffs**:
- The guard is structurally correct but dormant until `PRODUCTION_CONVEX_URL` is filled in; until then it is a safety net with no net underneath it. This is accepted deliberately (the engineer chose to defer production stand up), not an oversight.
- `weeklyPrograms` moving out of `contentSeed.ts` means two seed commands to run on a fresh staging deployment instead of one; `convex/AGENTS.md`'s seed command list should be updated to reflect the new function names (left to `/sync`, not this spec).
- Both sample seeds now require the caller to pass `allowSampleData: true` explicitly; whoever re-seeds staging has one more thing to remember, in exchange for the guard no longer failing open on a single mistyped constant.
- Rows created before AC-8 (on the dev deployment, the three facilities were created `active: true`) are not repaired by any seed. They stay live until someone edits them by hand. Accepted for dev, per the engineer; fresh deployments are hidden from the start.
- Existing weekly program rows keep their legacy `dayOfWeek`/`time` fields and `coverImageUrl`. The seed matches on `title` and skips them, so it never repairs a row. This is the same "legacy rows untouched" rule as AC-8.
- AC-7 means the same rows exist whichever seed runs first, but not necessarily the same fields. If `facilityDrafts` runs first, the three facilities are bare name-only drafts. If `seedChurchAdmin` runs first, they also get sample details. The engineer accepted this; the sample fields are not filled in later.
- Staging demos that rely on a visible facility will see nothing from a fresh seed, because the three facilities are hidden drafts. This needs a manual check before any staging demo depends on them.
- Revoking old system_admin grants is not part of this build. See the Follow-up audit item.

**Neutral**:
- `spec/DEPLOYMENT.md`'s "PR 7" placeholders stay unfilled; this spec's Follow-up is effectively that runbook, parameterized with the decisions already made in this conversation.

## Follow-up

Decided in this conversation; no remaining design work, only execution once production stand-up is scheduled:

- [ ] Audit the old `system_admin` grants that `seedContent` created on dev, staging, and any other deployment it ran on before this fix. List each one and revoke by hand (decided: audit and report, no automatic revoke).
- [ ] Create the production Convex project; set `PRODUCTION_CONVEX_URL` to its real `*.convex.cloud` URL — this single edit activates every guard already wired in this build.
- [ ] Configure Convex Pro backup schedule: **daily automatic, 30-day retention** (decided; Convex Pro dashboard setting, no application code). Add a "take a manual backup before any risky change" step to the team's own migration checklist (F5-05, NF-15).
- [ ] Create the `production` branch; add GitHub branch protection restricting merge/push to Andrew only — a technical control for NF-16's "production deployments are Andrew's alone," not just a process rule (decided).
- [ ] Add `deploy-production.yml` (GitHub Actions), mirroring `deploy-staging.yml`, using a production `CONVEX_DEPLOY_KEY`.
- [ ] Provision the production Cloudflare Workers environment; register and point the real portal domain (not registered yet).
- [ ] Verify the Resend sending domain for production (not set up yet) — coordinate with feature 7 (password reset and emails).
- [ ] Create the production Google Cloud OAuth client — coordinate with feature 30 (Google sign-in).
- [ ] Create the production Africa's Talking account and get the sender ID approved — coordinate with feature 27 (Hospitality SMS).
- [ ] Set up Apple Developer and Google Play Console accounts; trigger the first `eas build --profile production` — coordinate with feature 21 (store readiness/pilot).
- [ ] Provision the production R2 bucket, scoped API token, and CORS policy per `spec/STORAGE.md`'s existing one-time provisioning steps (dev bucket is already live; prod is the only one pending).
- [ ] Once the above lands, fill in `spec/DEPLOYMENT.md`'s "PR 7" placeholders with the real values.
- [ ] F5-02 (full production setup), F5-04 ("staging mirrors production, tested there first"), and the branch-protection half of NF-16 cannot be `/check verify`'d until a production environment actually exists — note this explicitly so verification isn't attempted against an environment that isn't there yet.
