# 0004. Remove suspension and web sign up, move System Admin pages into Administration

**Date**: 2026-10-14
**Status**: In Progress

## Summary

This feature retires two capabilities nobody should have (suspending a user, and creating a brand new account from the web portal) and folds the separate System Admin area into the Administration portal, since it never needed its own portal. It is three related but independently buildable pieces, covered here as one umbrella with a child spec each. Suspension turns out to be dead code today, it changes nothing about real access control. Web sign up removal closes a real gap: the web sign in page's Google button can silently create a new account today, which the product rules do not allow. The System Admin move relocates working pages (accounts, roles, audit log) rather than rebuilding them, and deliberately leaves Content (Themes) where it is, since its real destination is Pastoral, a later feature not yet designed.

## Structure

- [0004-suspension-removal.md](0004-suspension-removal.md): removes the suspend and reactivate capability end to end (schema, backend, UI, shared types), satisfies SRS F1-05
- [0004-web-signup-removal.md](0004-web-signup-removal.md): removes the web sign up page and closes the Google sign in account creation gap, satisfies SRS F1-02
- [0004-system-admin-relocation.md](0004-system-admin-relocation.md): moves Accounts, Roles and Audit log from `/system-admin` into Administration, satisfies SRS F3-02, F3-03, A8-01, A8-02, A8-03

**Cross child contract**: the three children share one portal and one build plan ordering (below). The system admin relocation's dashboard step (its Build plan step 5) depends on the suspension removal's dashboard step (its Build plan PR A step 4) having already removed the suspended users attention card, so suspension removal must land first. Web sign up removal touches `convex/auth.ts`'s `createAuth` config, `packages/shared` (a small shared header constant), a few `apps/admin` pages, and three mobile call sites (two one line `requestSignUp: true` arguments and one `X-Client-Platform` header, see its own spec's AC-4); it has no hard dependency on the other two, but is sequenced second because it is the smallest, lowest risk change.

## Requirements

Each child spec carries its own user stories and acceptance criteria (its own contract, independently checkable). See each child's `## Requirements` section. At the umbrella level, the whole feature is done when every child's acceptance criteria hold and SRS F1-05, F1-02, F3-02, F3-03, A8-01, A8-02, A8-03 are all satisfied.

## Decision

**Chosen option**: Option 1: Remove, close the gap, and move (not rebuild), each as its own thin slice, in dependency order.

Build all three as independent thin end to end slices (backend plus UI together per slice, the project's Tracer Bullet approach), ordered suspension removal, then web sign up removal, then the System Admin move. Each child spec carries the full reasoning for its own piece; see each child's inline rationale and `rationale.md` for the shared forces behind grouping them and behind this order.

## Feature design

No shared data model, API surface, or security model spans all three children beyond what is already stated in the Structure section above; each child's own `## Feature design` carries what is specific to it. The one thing genuinely shared is the access boundary: all three touch who can reach what in `apps/admin`, and all three keep today's real enforcement layer (Convex functions checking the caller's role, per `convex/AGENTS.md`) as the actual guard, never relying on UI hiding alone.

## Build plan

Ordered across all three children, following the dependency noted in Structure above. Each task's own AC references are in its child spec.

**Phase 1, suspension removal** (see 0004-suspension-removal.md for the full two part plan): PR A widens the schema field to optional, stops every writer, removes the backend mutations/filters and the UI, adds and runs the migration on every environment; PR B, merged only once every environment verifies clean, removes the field from the schema. Historical audit log entries are left in place throughout.

**Phase 2, web sign up removal** (see 0004-web-signup-removal.md for the full eight steps): set `disableImplicitSignUp` on the Google provider and add the matching `requestSignUp: true` argument on the two mobile Google call sites, add a shared `X-Client-Platform: mobile` header constant and set it on mobile's email/password sign up call, gate the email/password sign up endpoint on that header, then remove the web sign up page, its links, and the stale middleware reference. (Originally an `Origin` header check; corrected to the explicit header after `/check verify` found Convex strips `Origin` before any function runs.)

**Phase 3, System Admin relocation** (see 0004-system-admin-relocation.md for the full seven steps): move Accounts and Audit log into Administration behind a route group guard, wire the nav group's visibility and the dashboard's System Admin only queries (fixing an existing unconditional call bug along the way), fold the one surviving attention card into Administration's dashboard (after Phase 1 has already removed the suspended users card), add the old URL redirects, and trim `/system-admin` down to Content only.

## Consequences

**Positive**:
- Three capabilities the product no longer wants (a fake suspension control, web self service sign up, a redundant portal) are gone or closed, each verifiably, not just hidden.
- Accounts, roles and the audit log keep working exactly as they do today, just reached from one portal instead of two.
- The web sign in page's account creation gap closes with Better Auth's own `disableImplicitSignUp` mechanism, not only a removed button, and the fix also corrects a pre existing dashboard bug (an unconditional call that already threw for non System Admins) found along the way.

**Negative / tradeoffs**:
- `/system-admin` does not fully disappear yet; Content (Themes) stays there until feature 19 gives it a real home in Pastoral, so SRS F3-02's "the `/system-admin` area is removed" is only partly true until that later feature ships.
- The suspension migration is a two part schema change (widen, backfill, narrow) across every environment, not a single deploy; it is low risk only because the field was never enforced, not because the migration itself is risk free.
- Moving Accounts and Audit log's URLs means every existing bookmark and internal link needs updating or redirecting; missing one leaves a dead link.
- The seed bootstrapped System Admin account must exist and have signed in on mobile at least once before web sign up removal ships to an environment, since it can no longer be created from the web.

**Neutral**:
- No new entities, no new third party integration, no new environment variables.
- Mobile needs a one line change on two call sites (`requestSignUp: true` for Google sign in/sign up), plus the shared `packages/shared` type cleanup (dead suspension types removed); nothing else on mobile changes.

## Follow-up

- [ ] Content/Themes' real move to Pastoral is deferred to feature 19 (`/architect Pastoral home and church overview`, not yet designed). When that spec is written, it should treat `/system-admin/content` as the source being moved, and `/system-admin`'s remaining trimmed route can then be fully retired.
- [ ] Platform analytics (SRS A8-04) and the cost register (A8-05) are explicitly not part of this feature, even though SRS F3-03's prose names them in the same sentence as the pages this feature does move. They belong to scope feature 31 (`/architect platform analytics and cost register`, not yet designed).
- [ ] `apps/admin` has no lint or test script today. The suspension migration and the new sign up gate (the `X-Client-Platform` header check) in `convex/auth.ts` are the two pieces of this feature most worth a Convex test; flag for `/test` to judge when this feature builds, per the project's "testing is intentionally light, add one when it is a judgment call worth making" convention.

## Rationale

Reasoning, options considered, and the forces behind grouping these three together and in this order: see [rationale.md](rationale.md).
