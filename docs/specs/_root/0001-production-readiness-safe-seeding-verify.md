# Verify: staging and production environments (safe seeding) · spec 0001 · updated 2026-10-04
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
(none: this feature has no UI surface)

## Commands
- [ ] `pnpm test:convex` → 22 tests pass, including the AC-1 to AC-7 suites → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- [ ] `pnpm exec tsc --noEmit -p convex/tsconfig.json` → no errors → AC-2, AC-4 (typed `weeklyPrograms` recurrence fields)
- [x] `pnpm exec convex run contentSeed:seedContent '{"allowSampleData": false}'` against a dev deployment → refuses with "pass allowSampleData: true", no themes written → AC-2
- [ ] `pnpm exec convex run contentSeed:seedContent '{"allowSampleData": true}'` against a dev deployment, then `pnpm exec convex run churchAdminSeed:seedChurchAdmin '{"allowSampleData": true}'` → both ok; no `roleAssignments` row created by either → AC-1, AC-2
- [ ] `pnpm exec convex run seed:facilityDrafts` with `SEED_ADMIN_EMAIL` user present, run twice → first run creates 3 hidden drafts (`active: false`), second run creates 0 → AC-3
- [ ] `pnpm exec convex run seed:weeklyPrograms`, run twice → 5 programs on `recurrence: "weekly"`, `daysOfWeek`, `startDate`, `startTime`, no `coverImageUrl`; second run creates 0 → AC-4
- [ ] Run `seed:facilityDrafts` then `churchAdminSeed:seedChurchAdmin` (and the reverse order on a fresh deployment) → exactly 3 facility rows, no duplicates → AC-7
- [ ] Before `bootstrapSystemAdmin` has created the `SEED_ADMIN_EMAIL` user, run `seed:facilityDrafts` and `seed:weeklyPrograms` → both return `{ ok: false }` and write nothing → AC-3, AC-4

## Value sourcing
- [ ] `seed:weeklyPrograms` `createdBy` on each row equals the `SEED_ADMIN_EMAIL` user's `_id` (vary the env var to a different email, expect refusal) → Value sourcing row "createdBy"
- [ ] `seed:weeklyPrograms` `startDate` is local start of day in Africa/Kampala (run just after local midnight, check the stored value) → Value sourcing row "startDate"
- [ ] Guard verdict: `isProductionDeployment` returns false while `PRODUCTION_CONVEX_URL` is empty, regardless of `CONVEX_CLOUD_URL` → Value sourcing row "guard check" → AC-6

## Acceptance-criteria coverage
- AC-1 … covered by `contentSeed.test.ts` (no roleAssignments row, including on re-run) and the seedContent command step above
- AC-2 … covered by `contentSeed.test.ts`, `churchAdminSeed.test.ts`, `environment.test.ts` (assertSampleSeedAllowed), and the allowSampleData command steps
- AC-3 … covered by `seed.test.ts` facilityDrafts suite and the facilityDrafts command step
- AC-4 … covered by `seed.test.ts` weeklyPrograms suite and the weeklyPrograms command step
- AC-5 … covered by `contentSeed.test.ts` (themes/events/announcements still seed behind the guard)
- AC-6 … covered by `environment.test.ts` (isProductionDeployment pure-function cases)
- AC-7 … covered by `seed.test.ts` order-independence suite and `churchAdminSeed.test.ts` already-seeded keyed-off-user test
