# Verify: staging and production environments (safe seeding) · spec 0001 · updated 2026-10-04
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
(none: this feature has no UI surface)

## Commands
- [x] `pnpm test:convex` → 29 tests pass (4 files; the note's "22" is stale — more were added since), including the AC-1 to AC-7 suites → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- [x] `pnpm exec tsc --noEmit -p convex/tsconfig.json` → no errors → AC-2, AC-4 (typed `weeklyPrograms` recurrence fields)
- [x] `pnpm exec convex run contentSeed:seedContent '{"allowSampleData": false}'` against a dev deployment → refuses with "pass allowSampleData: true", no themes written → AC-2
- [ ] `pnpm exec convex run contentSeed:seedContent '{"allowSampleData": true}'` against a dev deployment, then `pnpm exec convex run churchAdminSeed:seedChurchAdmin '{"allowSampleData": true}'` → both ok; no `roleAssignments` row created by either → AC-1, AC-2
- [ ] `pnpm exec convex run seed:facilityDrafts` with `SEED_ADMIN_EMAIL` user present, run twice → first run creates 3 hidden drafts (`active: false`), second run creates 0 → AC-3
- [ ] `pnpm exec convex run seed:weeklyPrograms`, run twice → 5 programs on `recurrence: "weekly"`, `daysOfWeek`, `startDate`, `startTime`, no `coverImageUrl`; second run creates 0 → AC-4
- [ ] Run `seed:facilityDrafts` then `churchAdminSeed:seedChurchAdmin` (and the reverse order on a fresh deployment) → exactly 3 facility rows, no duplicates → AC-7
- [ ] Before `bootstrapSystemAdmin` has created the `SEED_ADMIN_EMAIL` user, run `seed:facilityDrafts` and `seed:weeklyPrograms` → both return `{ ok: false }` and write nothing → AC-3, AC-4

## Value sourcing
- [x] `seed:weeklyPrograms` `createdBy` on each row equals the `SEED_ADMIN_EMAIL` user's `_id` → confirmed live on production (`superb-dog-305`, 2026-10-07): all 3 `facilityDrafts` rows and all 5 `weeklyPrograms` rows have `createdBy` equal to the `luswataandrew190@gmail.com` user's `_id`, via a direct `--inline-query` read. (The "vary the env var, expect refusal" half wasn't separately exercised — the handler's own `if (!admin) return { ok: false }` guard covers it, and is what `seed.test.ts` asserts.) → Value sourcing row "createdBy"
- [x] `seed:weeklyPrograms` `startDate` is local start of day in Africa/Kampala → confirmed by computation rather than clock-timing: "Sunday Service"'s stored `startDate` on production is `1767474000000`, which equals `Date.UTC(2026, 0, 4) - KAMPALA_OFFSET_MS` exactly (`1767484800000 - 10800000`) → Value sourcing row "startDate"
- [x] Guard verdict: `isProductionDeployment` returns false while `PRODUCTION_CONVEX_URL` is empty, regardless of `CONVEX_CLOUD_URL` → covered by `environment.test.ts`, part of the 29 passing tests above → Value sourcing row "guard check" → AC-6

## Acceptance-criteria coverage
- AC-1 … covered by `contentSeed.test.ts` (no roleAssignments row, including on re-run) and the seedContent command step above
- AC-2 … covered by `contentSeed.test.ts`, `churchAdminSeed.test.ts`, `environment.test.ts` (assertSampleSeedAllowed), and the allowSampleData command steps
- AC-3 … covered by `seed.test.ts` facilityDrafts suite and the facilityDrafts command step
- AC-4 … covered by `seed.test.ts` weeklyPrograms suite and the weeklyPrograms command step
- AC-5 … covered by `contentSeed.test.ts` (themes/events/announcements still seed behind the guard)
- AC-6 … covered by `environment.test.ts` (isProductionDeployment pure-function cases)
- AC-7 … covered by `seed.test.ts` order-independence suite and `churchAdminSeed.test.ts` already-seeded keyed-off-user test
