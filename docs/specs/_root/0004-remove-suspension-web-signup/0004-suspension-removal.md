# 0004. Remove suspension

## Summary

Suspension (the suspend and reactivate controls, the status field, and the badge) is removed from the product entirely, per SRS F1-05. A read of the actual code found that suspension blocks nothing today, no sign in check and no query anywhere reads it, so this is a cleanup, not a change in who can do what. The real work is a two part schema migration (widen the field to optional, backfill it away, then remove it), since every existing user document, and several places that still create new ones, carry a required status field.

## Requirements

**User stories**:
- As a System Admin, I no longer see suspend or reactivate controls anywhere, since the capability has been retired from the product.
- As anyone reading the audit log, I can still see past suspend and reactivate actions as history, even though the capability itself is gone.

**Acceptance criteria**:
- **AC-1**: The suspend and reactivate buttons, the status display, and the Suspended badge are removed from every admin screen that showed them (account detail, accounts list, the dashboard attention card).
- **AC-2**: The `users.status` field is removed from `convex/schema.ts`'s validator, and no existing or newly created user document ever holds a `status` value again.
- **AC-3**: The `suspendUser` and `unsuspendUser` Convex mutations are removed from `convex/admin.ts`, along with `listUsers`'s `status` filter argument and filter, `publicUser`'s `status` field, and `getDashboardStats`'s `suspendedUsers` count.
- **AC-4**: Past `user.suspended` and `user.unsuspended` activity log entries stay visible and filterable in the audit log, and no new entry of either kind is ever written again.
- **AC-5**: `packages/shared`'s `USER_STATUSES`, the `UserStatus` type, and `accountSchema`'s `status` field are deleted, and nothing in the codebase still imports any of them.

## Feature design

**Data model sketch**: the `users` table loses its `status` field entirely. No new entity, no new field elsewhere. The migration's target state: every existing `users` document has no `status` key at all, and nothing ever writes one again.

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| Migration verification | Confirmation that zero users still carry `status` | A dedicated `verifyUserStatusMigration` internal query (added in the widen phase, removed again once the field is gone, since it cannot type check without it), returning a `staleCount` that must read 0 on every environment before the narrowing schema change ships there |

**Key invariants**: once this ships, no code path anywhere (backend, admin, mobile) ever reads or writes a `status` field on a user document again, including every place a new user row is created.

**Security model**: none. Suspension was never enforced, so removing it changes no one's access. This is stated explicitly so the removal is not mistaken for closing a real gap; it closes none.

**Critical test scenarios**:
- Happy path: a System Admin opens a user's detail page; no suspend or reactivate control renders, verifies **AC-1**.
- Migration: after the widen and backfill phase runs against the dev deployment, `verifyUserStatusMigration` reports `staleCount: 0`, verifies **AC-2**.
- New users stay clean: signing up fresh on mobile and on the (still existing, pre removal) web path creates a user document with no `status` key, verifies **AC-2**.
- Audit continuity: the Activity page's Suspensions filter still shows pre existing historical entries after the feature is removed, verifies **AC-4**.
- Dead code: a repo wide search confirms no remaining reference to `UserStatus` or `accountSchema`'s `status` field, and `pnpm --filter @klt-cyber/shared test` still passes, verifies **AC-5**.

## Build plan

**PR A (widen and stop writing, deployed to dev, staging, and production before PR B merges):**

1. Change `convex/schema.ts`'s `users.status` to optional (`v.optional(v.union(v.literal("active"), v.literal("suspended")))`), satisfies **AC-2**
2. Stop every writer: remove the `status: "active"` line from `convex/auth.ts`'s `onCreate` trigger and from `convex/churchAdminSeed.ts`, and remove the `status` field from the user fixtures in `convex/seed.test.ts`, `convex/churchAdminSeed.test.ts`, and `convex/contentSeed.test.ts`, satisfies **AC-2**
3. Remove every reader: `suspendUserCore`, `unsuspendUserCore`, `suspendUser`, `unsuspendUser`, and the `status` references in `listUsers`, `publicUser`, and `getDashboardStats`, from `convex/admin.ts`; the `ActivityUser.status` field and its use in `apps/admin/lib/activity.ts`; the `?status=` URL param and the "Suspended" filter option in `UsersClient.tsx`, satisfies **AC-3**
4. Delete `AccountActionsCard.tsx` entirely; remove the Suspended badge from `UserDetailClient.tsx` and `UsersClient.tsx`; remove the suspended users attention card and its count from the system admin `DashboardClient.tsx`; remove the `suspended` variant from `components/shadcn/badge.tsx`, satisfies **AC-1**
5. Add `convex/userStatusMigration.ts`: an idempotent `migrateUserStatus` internal mutation that patches `{ status: undefined }` on every `users` document that still has one (paginate if the table holds more than about 4,000 rows, to stay inside a single mutation's write limit), and a `verifyUserStatusMigration` internal query returning `{ staleCount }`, satisfies **AC-2**
6. Delete `USER_STATUSES`, the `UserStatus` type, and `accountSchema`'s `status` field from `packages/shared`, update its barrel export and existing tests, satisfies **AC-5**
7. Run `migrateUserStatus` against dev, confirm `verifyUserStatusMigration` reports `staleCount: 0`, then repeat against staging and production once each environment has PR A deployed, satisfies **AC-2**

**PR B (narrow, merged only once every environment reports `staleCount: 0`):**

8. Remove `status` from `convex/schema.ts`'s users validator entirely, and delete `userStatusMigration.ts` (its job is done, and `verifyUserStatusMigration` can no longer type check against a schema with no `status` field), satisfies **AC-2**

Confirm `lib/activity.ts`'s Suspensions filter group (the group itself, not the `ActivityUser.status` field removed in step 3) and its `user.suspended`/`user.unsuspended` labels are left as is, satisfies **AC-4**.

## Migration plan

**Strategy**: feature flagged by schema shape, not a runtime flag: widen the field to optional first, backfill every document and every writer away from it, verify clean, only then narrow the schema. Convex validates existing documents against a pushed schema (rejecting both a missing required field and an unexpected extra one), so migrating or narrowing in the wrong order both fail outright, not just risk failing.

**Phases**:
1. PR A ships to dev: schema widened, every writer and reader removed, the migration and verification functions added.
2. Run `migrateUserStatus` against dev, confirm `staleCount: 0`.
3. PR A promotes to staging (via `main`) and then production (via `prod`), running the same migrate and verify steps against each after it deploys there.
4. Only once every environment reports `staleCount: 0`, merge PR B (the narrowing schema change) and let it promote through the same staging then production path.

**Rollback**: PR A's revert is safe at any point, since `status` stayed optional and no document relied on it. PR B's revert is only safe before any document is created without a `status` field after PR B ships; once that happens, reverting PR B would make the schema require a field new documents no longer have, so reverting past that point needs a fresh migration to backfill `status: "active"` back onto the gap, not a plain revert.

**Risks**: merging PR B before every environment's migration has been confirmed clean would make that environment's narrowing push fail outright (Convex rejects the push, it does not silently succeed with stale data). Treat the `staleCount: 0` check as a hard gate per environment, not a one time dev only check.

## Rationale (inline)

Suspension's removal is straightforward once the diagnostic (performed during this spec's design, not assumed) confirmed it enforces nothing: no `authz.ts` check, no query filter blocks a suspended user from doing anything. The two part migration (widen then narrow, as PR A then PR B) follows the same pattern already used in `convex/leadershipMigration.ts`, chosen because Convex's schema validation rejects a push in either direction otherwise, confirmed against the installed `convex` package's own types and the `convex-test` helper's validation behavior during this spec's cross check, not assumed. See the umbrella's [rationale.md](rationale.md) for the full context this finding came from.
