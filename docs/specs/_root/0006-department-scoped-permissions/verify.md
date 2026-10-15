# Verify: department scoped permissions · spec 0006 · updated 2026-10-15
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `pnpm --filter @klt-cyber/shared test` → all tests pass (shared validators unbroken) → AC-8
- [x] `pnpm exec vitest run --config convex/vitest.config.ts` → all 46 tests pass (17 new permission tests) → AC-1, AC-2, AC-4, AC-5, AC-6, AC-8
- [x] `pnpm lint` → clean, no regressions → AC-8

## UI / manual
- [ ] Sign out of mobile app → Home content (events, themes, announcements, programs, facilities) disappears (returns null, shows empty state or sign in prompt) → AC-1
- [ ] Sign in as a verified Media roster member (no roleAssignment) → portal opens → Areas of Service hub appears with department tiles → AC-4
- [ ] Same Media roster member → their department tile is clickable → AC-7
- [ ] Sign in as unverified user with a Media roster membership → portal redirects to `/unauthorized` → AC-4
- [ ] Sign in as a user with no role and not on any roster portal department → portal redirects to `/unauthorized` → AC-4
- [ ] Sign in as System Admin → hub shows all 13 departments: 7 active tiles + 6 greyed "Coming soon" tiles → AC-5
- [ ] Sign in as an HOD → navigate to own department roster → roster loads with member profiles → AC-2
- [ ] Same HOD → attempt to view another department's roster (direct URL) → rejected → AC-2
- [ ] Sign in as Administration HOD → can view any department's roster → AC-2
- [ ] Sign in as a delegate (department_admin) → roster page shows no "Appoint as delegate" or "Remove from roster" buttons → AC-3
- [ ] Sign in as HOD → roster page shows "Appoint as delegate" and "Remove from roster" buttons → AC-3
- [ ] Attempt to appoint HOD without selecting a department → error: "An HOD appointment must name a department" → AC-6
- [ ] Appoint HOD with a departmentId → succeeds → AC-6

## Value sourcing
- [ ] `hasPortalAccess`: Hospitality roster member with verified profile → true; same user after profile status changes to `pending_verification` → false → AC-4
- [ ] `hasPortalAccess`: user with active `clan_elder` role but no department → true (has a roleAssignment) → AC-4
- [ ] `getRosterReadAuthorityOrNull`: delegate for Finance department querying Finance roster → succeeds; same delegate querying Media roster → rejected → AC-2

## Acceptance criteria coverage
- AC-1 covered by: content sign in gating tests (6 queries) + mobile sign out check
- AC-2 covered by: roster scoped read tests + HOD own/other roster manual checks + value sourcing delegate check
- AC-3 covered by: delegate vs HOD button visibility manual checks
- AC-4 covered by: hasPortalAccess tests (7 cases) + portal access manual checks + value sourcing checks
- AC-5 covered by: System Admin hub tile count manual check + hub query test
- AC-6 covered by: unscoped HOD rejection test + manual appointment check
- AC-7 covered by: roster portal member department access manual check
- AC-8 covered by: 17 automated backend tests in `convex/permissions.test.ts`
