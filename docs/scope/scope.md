# Scope: KLT Cyber Church App — Phase 01

Kingdom Life Tabernacle's digital church platform: a mobile member app and a web portal for department leaders, on one shared Convex backend. Serves about 50 ministers at launch (29 November 2026), then the whole congregation.

**Build approach:** Tracer Bullet (each numbered feature is built end to end — backend, UI, tests — through the full `/architect → /develop → /check verify → /test → /check review → /document → /sync` loop, rather than layering one discipline across the whole app at a time). Inferred from `spec/BUILD-PLAN.md` §1's per-feature loop; not asked as a panel since the build plan already fixes it.
**Workflow:** Beta (after `/develop`: `/check verify`, `/test`, `/document` — the project default). GA features add a fresh-model `/check review` before `/document`; Alpha features skip `/test`. Set by `spec/BUILD-PLAN.md` §1.1, not the generic skill default.

_This scope transcribes the already-agreed `spec/BUILD-PLAN.md` into the living format `/develop`, `/check`, `/test` and `/sync` read from. It does not re-decide order, tiers, or tracks — those come from the build plan. Skip `/architect` on any feature the moment you already know how to build it._

## At a glance

| # | Feature | Phase | Status |
|---|---|---|---|
| 1 | Spec and repo cleanup | Week 1 | existing |
| 2 | Staging and production environments, safe seeding, backups | Week 1 | in-progress |
| 3 | Error screens, Sentry, update channels | Week 1 | in-progress |
| 4 | Stay signed in | Week 1 | planned |
| 5 | Remove suspension and web sign-up; move System Admin pages into Administration | Week 1 | in-progress |
| 22 | Devotionals and past events | Week 1 | planned |
| 6 | Department-scoped permissions, portal access rules, permission tests | Week 2 | in-progress |
| 7 | Password reset and the five emails (Resend) | Week 2 | planned |
| 8 | Account deletion | Week 2 | planned |
| 11 | Cancel and restore a single program occurrence | Week 2 | in-progress |
| 12 | Mobile shell and Home slots | Week 2 | in-progress |
| 15 | Updates "My groups", Events & Programs, add to calendar | Week 2 | in-progress |
| 31 | Platform analytics and cost register | Week 2 | planned |
| 17 | Shared department shell | Week 3 | in-progress |
| 10 | Notification targeting: appointment audiences, revocation notice, first-publish only, deep links to ended items | Week 3 | in-progress |
| 9 | Profile lifecycle core: pending edits, send-back, edit after verification, clan "I don't know", name and photo sync, spouse search fix, mentorship bug | Week 3 | in-progress |
| 25 | Library: catalogue, free content, stock | Week 3 | planned |
| 26 | Real Estate: Tower of Faith and spaces to let | Week 3 | in-progress |
| 20 | Radio core: schedule, player, status, listening records, follow, recordings | Week 4 | in-progress |
| 18 | Administration core: dashboard fix, directory contacts, departments and clans pages, events with times, audiences and cancel, year planner delete | Week 4 | in-progress |
| 13 | Member directory with sharing | Week 4 | in-progress |
| 14 | My Profile and settings | Week 4 | in-progress |
| 24 | Hospitality core: visitors, follow-ups, regulars, clan placement, reports | Week 4 | in-progress |
| 28 | Notification settings, web bell, images | Week 4 | in-progress |
| 16 | Give and Finance giving settings | Week 5 | in-progress |
| 19 | Pastoral: Home content, church overview, Radio inbox | Week 5 | in-progress |
| 27 | Hospitality SMS (Africa's Talking) | Week 5 | planned |
| 32 | Radio Insights with PDF and map | Week 5 | planned |
| 23 | Clan portal and Super T | Week 6 | planned |
| 29 | Mentorship confirmation and reminders | Week 6 | planned |
| 30 | Google sign-in | Week 6 | in-progress |
| 21 | Store readiness and launch content | Pilot | planned |

## Week 1

### 1. Spec and repo cleanup · existing · Alpha
Track A. Turn the SRS into the single source of truth for the build and retire the old scattered docs, so every later feature builds against one agreed document.
**Done when:** F5-01: `docs/` is deleted and every reference to it removed (including comments citing the missing `docs/Alignment.md`); `spec/SRS.md` is the cited source of truth; `AGENTS.md`/`CLAUDE.md` are short, correct working instructions pointing to it; the DATA_MODEL increments convention is retired from code comments.
SRS: F5-01 · code: `spec/`, `AGENTS.md`, `.gitignore` (commits `54e539f`, `378fa29`)

### 2. Staging and production environments, safe seeding, backups · in-progress
Track A. Give the app real staging and production homes with the right data in each, so nothing built after this runs against a fake or unsafe environment.
**Done when:** F5-02: separate staging and production Convex/R2/Cloudflare/EAS environments exist. F5-03: production seeds only the 12 clans, 13 departments, seeded radio programs and Tower of Faith facility names as hidden drafts, the first System Admin only from `SEED_ADMIN_EMAIL`, and no sample data; staging gets sample data. F5-04: staging mirrors production and every change is tested there first. F5-05: regular restorable backups, and one before any risky change.
- [x] Design it (spec): `/architect staging and production environments`
Spec: [0001](../specs/_root/0001-production-readiness-safe-seeding.md)
- [x] Build it: `/develop staging and production environments`
  - [x] Guard infrastructure: `convex/lib/environment.ts` (`isProductionDeployment`, a pure function), satisfies AC-2, AC-6
  - [x] Safe-everywhere reference seeds: `seed.ts:facilityDrafts`, `seed.ts:weeklyPrograms`, satisfies AC-3, AC-4
  - [x] Guard + bug fixes on the sample seeds: `contentSeed.ts` (remove the role-grant bug, add `allowSampleData` + the guard), `churchAdminSeed.ts` (same guard, fix the seeding-order check), satisfies AC-1, AC-2, AC-5, AC-7
  - [x] Automated tests for the guard, idempotency, and order-independence, satisfies AC-1 through AC-7
- [ ] Verify it: `/check verify staging and production environments`
- [x] Test it: `/test staging and production environments`
- [x] Document it: `/document staging and production environments`
SRS: F5-02, F5-03, F5-04, F5-05, NF-15, NF-16 · code: `convex/seed.ts` (`bootstrapSystemAdmin` already reads `SEED_ADMIN_EMAIL`), `convex/churchAdminSeed.ts`, `convex/contentSeed.ts`, `convex/lib/environment.ts`

### 3. Error screens, Sentry, update channels · in-progress
Track A. Make failure visible and recoverable instead of a blank screen or crash, and get eyes on production errors before ministers report them.
**Done when:** F5-06: every screen shows a friendly message and retry on failure, web and mobile (NF-06). F5-07: Sentry captures errors and crashes from mobile, web and backend (NF-13). F5-08: Expo OTA updates run on separate staging and production channels (NF-14). M1-04: a poor connection shows a clear message and retry, not a blank screen.
- [x] Design it (spec): `/architect error screens, Sentry, update channels`
Spec: [0002](../specs/_root/0002-error-screens-sentry-update-channels/index.md) (umbrella: error screens, Sentry observability, update channels — the last one already shipped, documented not designed)
- [ ] Build it: `/develop error screens, Sentry, update channels`
  - [x] Backend Sentry: provisioning, the action-only `reportError` helper, Convex env vars — satisfies AC-3 (0002-sentry-observability.md). Sentry org + 3 projects provisioned, `SENTRY_DSN`/`SENTRY_ENVIRONMENT` set on the dev deployment; staging/production deployments still need the same `convex env set` once those deployments are live.
  - [x] Error screens shared components: `ErrorState`, the connectivity hook, the dependency free fallback, the retry cooldown — satisfies AC-1, AC-2, AC-4, AC-5 (0002-error-screens.md)
  - [x] Sentry SDK init on mobile and web, user context wiring — satisfies AC-1, AC-2, AC-4, AC-5, AC-6 (0002-sentry-observability.md)
  - [x] Wire the four reference screens (boundary for query paths, upgraded local catch for mutation paths) — satisfies AC-1, AC-3, AC-6 (0002-error-screens.md), AC-1, AC-2 (0002-sentry-observability.md)
  - [ ] CI config (source maps, release tagging per surface) and a mobile dev-client rebuild/preview APK build to verify the new native dependencies — satisfies AC-7 (0002-sentry-observability.md). All config now in place: `SENTRY_AUTH_TOKEN` as a GitHub Actions secret and an EAS (preview + production) environment variable, Cloudflare Build variables/secrets on both `klt-cyber` and `klt-cyber-prod`, mobile DSNs/org/project wired into `eas.json`/`app.config.ts`/both deploy workflows. Only the dev-client rebuild + "Build (preview APK)" run itself remains — deliberately held off (costs EAS build time), not blocked.
- [ ] Verify it: `/check verify error screens, Sentry, update channels`
- [ ] Test it: `/test error screens, Sentry, update channels`
- [ ] Document it: `/document error screens, Sentry, update channels`
SRS: F5-06, F5-07, F5-08, M1-04, NF-06, NF-13, NF-14

### 4. Stay signed in · planned
Track A. Stop asking ministers to sign in on every launch — a launch blocker.
**Done when:** F1-09: reopening the app goes straight to Home; session persists until sign-out, deletion, or long-period expiry (NF-10). The cause of today's forced re-sign-in is investigated, not assumed.
- [ ] Design it (spec): `/architect stay signed in`
Spec: not yet captured
SRS: F1-09, NF-10

### 5. Remove suspension and web sign-up; move System Admin pages into Administration · in-progress · GA
Track A. Retire two features nobody should have (suspension, web sign-up) and fold the System Admin's separate area into Administration, since it never needed its own portal.
**Done when:** F1-05: suspend/reactivate controls, the status field and the badge are removed entirely. F1-02: web sign-up is removed (portal access rules in SRS §3.2). F3-02: no separate System Admin portal — `/system-admin` is removed, its pages move under Administration. F3-03: Administration shows the extra System Admin pages (accounts, roles, audit log, analytics, cost register). A8-01/A8-02: account and role management move with it, moved not rebuilt. A8-03: audit log browsing already works, just needs to move.
- [ ] Design remaining work (spec): `/architect remove suspension and web sign-up`
Spec: not yet captured
SRS: F1-05, F1-02, F3-02, F3-03, A8-01, A8-02, A8-03 · code: `apps/admin/app/(admin)/system-admin/` (activity, content, users — exists, needs relocation)

### 22. Devotionals and past events · planned
Track B. Give members a daily devotional and a browsable archive of past church events, both run entirely by Media.
**Done when:** D1-01/D1-04: Media writes and edits a devotional (title, scripture, text, date), one per date, and can schedule ahead. D1-03: a user reads today's devotional on Home (M2-03) and browses recent ones. P1-01/P1-03: Media adds a past event with title, date and YouTube link, with an automatic thumbnail. P1-02: a user browses past events as thumbnails and opens them in YouTube (M4-05).
- [ ] Design it (spec): `/architect devotionals and past events`
Spec: not yet captured
SRS: D1-01, D1-02, D1-03, D1-04, P1-01, P1-02, P1-03, M2-03, M4-05

## Week 2

### 6. Department-scoped permissions, portal access rules, permission tests · in-progress · GA
Track A. Make every permission in the SRS real on the server, since every later department feature depends on it holding.
**Done when:** F3-01: the Areas of Service hub shows exactly the departments a person can open. F3-04: an HOD sees their own roster only, full profiles, regardless of sharing. F3-05: a delegate only sees buttons the backend will actually let them use. F3-08: church content requires sign-in on every query. F3-09: an HOD appointment always names a department — no unscoped HOD. F3-19: Media, Hospitality and Library roster members open their department portal without holding a role. F5-09/NF-01: automated tests cover the permission rules.
- [ ] Design remaining work (spec): `/architect department-scoped permissions`
Spec: not yet captured
SRS: F3-01, F3-04, F3-05, F3-08, F3-09, F3-19, S1-03, F5-09, NF-01, NF-17

### 7. Password reset and the five emails (Resend) · planned
Track A. Let anyone who forgets their password get back in, and send the five emails the SRS actually calls for — no more, no less.
**Done when:** F1-03: a reset link is requested by email, expires, and the screen shows the same message whether or not the email exists. Exactly five events send email: welcome, password reset, profile verified, profile sent back, account deletion confirmed — from a church-domain Resend address, replies to `kingdomlifeug@gmail.com`.
- [ ] Design it (spec): `/architect password reset and emails`
Spec: not yet captured
SRS: F1-03, F1-10

### 8. Account deletion · planned · GA
Track A. Let a person leave the platform from inside the app, without leaving their personal data behind.
**Done when:** F1-06: deleting an account revokes roles, leaves rosters, and anonymizes personal data (not erasing it); the audit log keeps an anonymized record; a confirmation email is sent; a public web page also accepts deletion requests.
- [ ] Design it (spec): `/architect account deletion`
Spec: not yet captured
SRS: F1-06

### 11. Cancel and restore a single program occurrence · in-progress
Track A. Let Administration call off one Wednesday's service without deleting the recurring program or leaving a stale reminder.
**Done when:** A4-02: a single occurrence is cancelled with an optional reason, shows as cancelled, sends no reminder, with an option to notify members (N20). A4-03: a cancelled occurrence can be restored. F4-02: reminders never fire for a cancelled occurrence. M2-05/M4-03: a cancelled occurrence shows as cancelled wherever programs appear.
- [ ] Design remaining work (spec): `/architect cancel and restore a program occurrence`
Spec: not yet captured
SRS: A4-02, A4-03, F4-02, M2-05, M4-03 · code: `convex/weeklyPrograms.ts` (recurring programs already exist; per-occurrence cancel does not)

### 12. Mobile shell and Home slots · in-progress
Track B. Give the app its real tab bar and a Home screen built from real content instead of placeholders, so every later mobile feature has somewhere to slot in.
**Done when:** M1-01: Home, Radio, Give, Updates, Community on the tab bar, everything else in the top-bar menu. M1-02: every menu item works — nothing locked or dead. M2-01/M2-02: Home shows the current theme and the Team Leader's welcome, vision and core values, authored by Pastoral. M2-04: a "Live now" card opens Radio when live, hidden otherwise. M2-06/M2-07: Home shows upcoming events/activities and the visitor's own membership status (pending, sent back with reason, or become-a-member). M2-08: empty sections don't render.
- [ ] Design remaining work (spec): `/architect mobile shell and Home slots`
Spec: not yet captured
SRS: M1-01, M1-02, M1-03, M1-04, M2-01, M2-02, M2-03, M2-04, M2-05, M2-06, M2-07, M2-08, M8-01 · code: `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/components/navigation/`

### 15. Updates "My groups", Events & Programs, add to calendar · in-progress
Track B. Give members one place to find their department/clan messages and every upcoming church happening, with a one-tap way to remember it.
**Done when:** M3-03: department and clan messages appear under "My groups" even after the notification is cleared, and disappear when deleted. M3-02: an announcement's category shows. M4-01/M4-02: upcoming events and the caller's activities show tagged, with date, times, location, description; cancelled items marked. M4-04: an event or activity can be added to the phone's calendar in one tap.
- [ ] Design remaining work (spec): `/architect Updates, Events and Programs`
Spec: not yet captured
SRS: M3-01, M3-02, M3-03, M3-04, M4-01, M4-02, M4-03, M4-04 · code: `apps/mobile/app/(tabs)/updates.tsx`, `apps/mobile/app/events.tsx`

### 31. Platform analytics and cost register · planned
Track B. Give the System Admin one screen for platform health (people, activity, devices, engagement, notifications, errors) and one for what every paid service actually costs.
**Done when:** F3-17/A8-04: System Admin sees people/activity/device/engagement/notification/health numbers as specified in SRS §4.3.3. A8-05: a cost register (plan, cost, billing cycle, renewal date per service) with renewal reminders (F5-07). F1-11: "last active" is recorded on use, feeding active-user counts.
- [ ] Design it (spec): `/architect platform analytics and cost register`
Spec: not yet captured
SRS: F3-17, F1-11, A8-04, A8-05

## Week 3

### 17. Shared department shell · in-progress · GA
Track A. Give every in-scope department the same working home (Dashboard, Roster, Activities, Messages, Settings) so each department then only has to add what's genuinely its own.
**Done when:** S1-01: picking a department from the hub lands on its Dashboard (F3-01). S1-03: a portal user only sees pages/buttons their role allows, enforced on the server. S3-05/S3-06/S3-07/S3-09/S3-10: an HOD confirms or declines claims, adds a verified member, removes a roster member, appoints/removes a delegate — all logged and notified. S4-01/S4-02: an HOD or delegate creates, edits and cancels a department activity with verified members notified and reminded (F4-17). S5-01/S5-04: department messages and HOD-to-HOD notices (F4-20). S1-04: every page works on a phone browser.
- [ ] Design remaining work (spec): `/architect shared department shell`
Spec: not yet captured
SRS: S1-01, S1-02, S1-03, S1-04, S2-01, S2-02, S2-03, S2-04, S3-01, S3-02, S3-03, S3-04, S3-05, S3-06, S3-07, S3-08, S3-09, S3-10, S4-01, S4-02, S4-03, S4-04, S5-01, S5-02, S5-03, S5-04, S5-05, S6-01, S6-02, F4-08, F4-14, F4-15, F4-16, F4-17, F4-18, F4-20 · code: `convex/departmentMemberships.ts` (`addDepartmentMember`, `removeDepartmentMember`, `updateDepartmentMembership` already exist)

### 10. Notification targeting: appointment audiences, revocation notice, first-publish only, deep links to ended items · in-progress · GA
Track A. Make sure a notification reaches only the people it actually concerns, and that tapping one never dead-ends on "not found".
**Done when:** F4-03: a new HOD/delegate/elder and the people they now lead are told — never all users. F4-04/F3-10: a person whose role is removed is told privately. F4-05: Administration is alerted on profile submission/resubmission and mentorship-confirmation requests. F4-06: profile verified/sent-back notices go push, in-app and email, with the reason on send-back. F4-12: tapping a notice about a started event or expired announcement still opens it, marked ended (today shows "not found"). F4-13: profile notices open My Profile; appointment notices explain the role. F4-01: an announcement notifies only on its first publish.
- [ ] Design remaining work (spec): `/architect notification targeting`
Spec: not yet captured
SRS: F4-01, F4-03, F4-04, F4-05, F4-06, F4-07, F4-12, F4-13, F3-10 · code: `convex/notifications.ts`, `convex/lib/reminders.ts`

### 9. Profile lifecycle core: pending edits, send-back, edit after verification, clan "I don't know", name and photo sync, spouse search fix, mentorship bug · in-progress · GA
Track A. Close the biggest gaps in the one path from visitor to member: editable pending submissions, an honest send-back flow, full post-verification editing, and two known bugs (mentorship always showing "Completed", spouse search leaking email).
**Done when:** F2-03: a pending visitor edits their submission while it waits; reviewers always see the latest version. F2-05/A2-02: Administration sends a profile back with a written reason; the person is notified and can edit and resubmit (marked "Resubmitted", A2-03). F2-06: a verified member edits all their profile details, saved immediately and logged. F2-07: adding an Area of Service creates a pending claim; removing is blocked while HOD/delegate there; max three active. F2-11: mentorship status shows the real value, not a hardcoded "Completed" (bug). F2-12: spouse search results show name and photo of verified members only, never email (privacy fix). F2-16: a member with no clan sees "Your clan will be assigned by the Hospitality team". F1-07: name and photo are one source of truth everywhere.
- [ ] Design remaining work (spec): `/architect profile lifecycle core`
Spec: not yet captured
SRS: F2-01, F2-02, F2-03, F2-04, F2-05, F2-06, F2-07, F2-08, F2-09, F2-10, F2-11, F2-12, F2-13, F2-16, F1-07, A2-02, A2-03, A2-05 · code: `convex/memberProfiles.ts` (verification core already Built — F2-04)

### 25. Library: catalogue, free content, stock · planned
Track B. Let members browse and search what the Library carries (books, flash disks, merchandise, free content) and let the Library team keep the catalogue and stock counts current.
**Done when:** L1-01/L1-04: Library adds, edits, hides and removes an item (title, category, author, cover, type, price, availability). L1-05/L1-06: a user browses and searches the catalogue; paid items say "Available at the Library desk" with one-tap WhatsApp/call. L2-01/L2-02: free PDFs/audio upload and play in-app. L3-01/L3-03: starting quantity, stock movements logged, and an alert at 10 or fewer. L3-04: an out-of-stock item says so.
- [ ] Design it (spec): `/architect Library`
Spec: not yet captured
SRS: L1-01, L1-02, L1-03, L1-04, L1-05, L1-06, L2-01, L2-02, L3-01, L3-02, L3-03, L3-04, M10-01

### 26. Real Estate: Tower of Faith and spaces to let · in-progress
Track B. Move facility management to Real Estate and let members browse the Tower floor by floor and find a space to let.
**Done when:** RE1-02: adding a facility to a floor moves onto the existing facilities table, permission moving from Administration to Real Estate. RE1-03: opening hours per weekday drive "Open now"/"Closed". RE1-05: an incomplete facility (no contact yet) stays hidden from the app. RE2-01/RE2-04: Real Estate lists, marks (available/reserved/let) and edits spaces to let; a let space leaves the app; a user browses and contacts Real Estate in one tap.
- [ ] Design remaining work (spec): `/architect Real Estate`
Spec: not yet captured
SRS: RE1-01, RE1-02, RE1-03, RE1-04, RE1-05, RE1-06, RE2-01, RE2-02, RE2-03, RE2-04, M7-01, M7-02, M7-03 · code: `convex/facilities.ts`, `convex/schema.ts` (`facilities` table exists; Real Estate ownership does not)

## Week 4

### 20. Radio core: schedule, player, status, listening records, follow, recordings · in-progress
Track A. Replace the static Radio tab with a real live stream, schedule and listening tracker, and give Media the tools to run broadcasts and recordings — the foundation the clan portal's Super T and Radio Insights both depend on.
**Done when:** R1-01: the live stream plays, replacing the static screen and fake listener count/chat. R1-02: playback continues on lock screen/background. R1-04: Live/Off air/Interrupted status, automatic with Media's manual override winning (R2-05). R1-08: listening time is recorded per user per broadcast while actually listening. R2-01: Media maintains the seeded broadcast schedule (Morning Glory, Super T, Midweek Service, etc.). RC1-01: Super T is never recorded. R1-09: an anonymous prayer request or named testimony reaches the Radio inbox.
- [ ] Design remaining work (spec): `/architect Radio core`
Spec: not yet captured
SRS: R1-01, R1-02, R1-03, R1-04, R1-05, R1-06, R1-07, R1-08, R2-01, R2-02, R2-03, R2-04, R2-05, R2-06, RC1-01, RC1-02, RC1-03, RC1-04, M2-04, NF-09 · code: `apps/mobile/app/(tabs)/radio.tsx` (static placeholder screen already exists)

### 18. Administration core: dashboard fix, directory contacts, departments and clans pages, events with times, audiences and cancel, year planner delete · in-progress
Track A. Fix what Administration's dashboard gets wrong today and finish the pages every other department's shell also needs: real audiences on events, single-occurrence program control, and a clans page.
**Done when:** A1-03: the dashboard's recent-activity card stops erroring for non-System Admins (bug — today it uses a System Admin-only query). A3-01: the members directory shows contact details (age stays out of the table). A3-05: a clans page lists all 12 with elders, appoint/replace (F3-16). A5-02: an event's audience is whole church, everyone serving anywhere, or selected departments — only that audience is notified. A5-04: an event can be cancelled, staying visible marked "Cancelled". A6-02: publishing an announcement notifies only the first time. A7-03: a planned activity can be deleted, with confirmation and logging.
- [ ] Design remaining work (spec): `/architect Administration core`
Spec: not yet captured
SRS: A1-01, A1-02, A1-03, A1-04, A2-01, A2-02, A2-03, A2-04, A2-05, A3-01, A3-02, A3-03, A3-04, A3-05, A3-06, A4-01, A4-02, A4-03, A5-01, A5-02, A5-03, A5-04, A5-05, A6-01, A6-02, A6-03, A7-01, A7-02, A7-03, F3-16, F4-15 · code: `apps/admin/app/(admin)/admin/` (dashboard, verification, weekly-program, events, announcements, year-planner all exist)

### 13. Member directory with sharing · in-progress · GA
Track B. Replace the placeholder member list with a real, privacy-respecting directory: private by default, and only sharers see other sharers' details.
**Done when:** M5-01/M5-02: real verified-member data replaces the placeholder list; search by name/occupation, filter by Area of Service/clan. M5-03: a sharing member opens another sharer's card and contacts them in one tap, only the fields the SRS's field-visibility table allows. M5-04: a private member sees a note that sharing unlocks others' details, with a one-tap toggle. NF-02: sharing is off by default and enforced on the server.
- [ ] Design remaining work (spec): `/architect member directory with sharing`
Spec: not yet captured
SRS: M5-01, M5-02, M5-03, M5-04, M5-05, F2-13, NF-02 · code: `apps/mobile/app/members.tsx` (visitor-invite state already Built — M5-05)

### 14. My Profile and settings · in-progress
Track B. Give every user one screen to see and change everything about themselves — profile, sharing, notifications, account.
**Done when:** M6-01: My Profile shows the real mentorship status (F2-11). M6-02: editing details/photo (F2-03, F2-06 to F2-08); a change to mentorship "Completed" shows "Awaiting confirmation" (F2-14). M6-03: departments, pending claims, clan (or "to be assigned"), and roles are visible; role holders get a pointer to the web portal. M6-04: directory sharing toggles on/off. M6-05: notification categories and followed radio programs are chosen here (F4-19, R1-07). M6-06: change password, sign out, delete account. M6-07: Help & Support reaches Andrew (F5-11).
- [ ] Design remaining work (spec): `/architect My Profile and settings`
Spec: not yet captured
SRS: M6-01, M6-02, M6-03, M6-04, M6-05, M6-06, M6-07, F5-11

### 24. Hospitality core: visitors, follow-ups, regulars, clan placement, reports · in-progress · GA
Track B. Give Hospitality one place to record every visitor (app or walk-in), follow up with first-timers, spot regulars heading toward membership, and place unassigned members into a clan.
**Done when:** H1-01: a walk-in is added with name, phone, gender, age group, visit date, invited-by, notes; a phone number requires the consent tick. H1-03: walk-in and app visitors appear in one list, first-timers and regulars flagged (3+ visits in a calendar month). H2-02/H2-03: one-tap call/WhatsApp/SMS from a template; outcome recorded (reached, no answer, wrong number, asked-not-to-be-contacted — which withdraws consent). H5-01: the profile wizard offers a clan or "I don't know my clan". H5-02/H5-04: Hospitality sees unassigned verified members oldest-first, clan sizes, and assigns — member and elder notified, logged.
- [ ] Design remaining work (spec): `/architect Hospitality core`
Spec: not yet captured
SRS: H1-01, H1-02, H1-03, H1-04, H1-05, H1-06, H1-07, H1-08, H2-01, H2-02, H2-03, H2-04, H2-05, H4-01, H4-02, H4-03, H5-01, H5-02, H5-03, H5-04, H6-01, H6-02 · code: `apps/mobile/app/profile-completion/clan.tsx` (the "I don't know my clan" wizard step already exists)

### 28. Notification settings, web bell, images · in-progress
Track B. Let every user control which push categories they get, give portal users the web bell as a real inbox of their portal work, and put images in notifications wherever the SRS's catalogue calls for one.
**Done when:** F4-19: mutable categories switch off push only (items still appear in-app) per the SRS §4.5 table; account/roles/Super T/portal-work stay non-mutable. F4-10: the web bell shows portal work with unread counts and mark-read, scoped to what SRS §4.5 lists — not general member content. F4-11: event/announcement/activity/message notifications show their image, always in-app and web bell, in the push where supported.
- [ ] Design remaining work (spec): `/architect notification settings and web bell`
Spec: not yet captured
SRS: F4-10, F4-11, F4-19, M6-05 · code: `convex/notifications.ts` (image support partially wired — F4-11 Change)

## Week 5

### 16. Give and Finance giving settings · in-progress · GA
Track A. Guide members to give outside the app, honestly, while Finance keeps every payment detail accurate and every change auditable — a wrong number here sends someone's money to the wrong place.
**Done when:** M9-01/M9-02: giving category and payment method are chosen from what Finance has set up and switched on (FN1-01, FN1-06). M9-04/M9-05: Android opens the dialer with the full MTN/Airtel code ready; iPhone copies the code (no `*`/`#` prefill). M9-06: the recipient name the network will show is shown first. M9-07: after starting a payment, honest guidance is shown — no fake "gift received", no fake transaction history. FN2-01: only the Finance HOD changes payment details, server-enforced. FN2-02: any change to payment details or method status immediately, non-mutably notifies the Pastoral HOD and System Admin.
- [ ] Design remaining work (spec): `/architect Give and Finance giving settings`
Spec: not yet captured
SRS: M9-01, M9-02, M9-03, M9-04, M9-05, M9-06, M9-07, M9-08, FN1-01, FN1-02, FN1-03, FN1-04, FN1-05, FN1-06, FN2-01, FN2-02, FN2-03

### 19. Pastoral: Home content, church overview, Radio inbox · in-progress · GA
Track A. Give the Pastoral team the spiritual-voice tools (themes, welcome message, vision) and a read-only view across the whole church, without any Administration powers.
**Done when:** PS1-01: annual/monthly themes move from `/system-admin` to Pastoral, warning when next month has none. PS1-02/PS1-03: the Team Leader's welcome/photo and the vision/core values are editable here (M2-02). PS2-01/PS2-02: prayer requests are always anonymous; testimonies carry the sender's name. PS2-03: Pastoral and Media see requests/testimonies arrive live, grouped by broadcast. PS3-01/PS3-02: every department and clan visible read-only, including contact details.
- [ ] Design remaining work (spec): `/architect Pastoral home and church overview`
Spec: not yet captured
SRS: PS1-01, PS1-02, PS1-03, PS2-01, PS2-02, PS2-03, PS2-04, PS2-05, PS2-06, PS3-01, PS3-02, PS3-03, PS3-04, PS4-01, R1-09 · code: `convex/themes.ts`, `apps/admin/app/(admin)/system-admin/content/ThemesManager.tsx` (themes editing exists at the wrong location)

### 27. Hospitality SMS (Africa's Talking) · planned · GA
Track B. Give Hospitality a real SMS channel for follow-ups and thank-yous, with cost and delivery visibility so nobody sends blind.
**Done when:** H3-01: SMS goes to one visitor or a selected group, consenting only, with a cost estimate shown before sending. H3-02: the HOD maintains templates with name/visit-date/next-service placeholders and a character counter. H3-03: delivery status shows via Africa's Talking delivery reports. H3-04: remaining credit is visible; the HOD is warned when low. H3-05: a consenting first-time walk-in gets an automatic thank-you SMS the evening after their visit.
- [ ] Design it (spec): `/architect Hospitality SMS`
Spec: not yet captured
SRS: H3-01, H3-02, H3-03, H3-04, H3-05

### 32. Radio Insights with PDF and map · planned
Track B. Give Media, Pastoral and the System Admin the analytics view over everything Radio and Super T produce — filtered, exportable, and never showing a named individual.
**Done when:** RI1-01/RI1-03: listeners live right now, total listening hours/unique listeners/average time, programs ranked. RI1-06: Super T observation by clan. RI1-07: a world map of listening totals by city only, from connection-derived location, never an individual's location. RI1-08: a PDF export in the system's theme, filters and dates printed. RI1-09: totals and breakdowns only, never named individuals (NF-02).
- [ ] Design it (spec): `/architect Radio Insights`
Spec: not yet captured
SRS: RI1-01, RI1-02, RI1-03, RI1-04, RI1-05, RI1-06, RI1-07, RI1-08, RI1-09

## Week 6

### 23. Clan portal and Super T · planned · GA
Track A. Give clan elders their own portal — members, messages, activities, and running the 24-hour Super T prayer rota — the last major piece that depends on Radio (feature 20) being live first.
**Done when:** F3-07: the clan portal link works (today a 404). F3-11: an elder sees all their clan's members, verified and pending, full profiles. F3-14: an elder assigns at most 2 members per gate from their own clan's verified members, deadline Monday 4PM, reminders Sunday 1PM/8PM (SRS §4.4). F3-15: an elder sees which of their clan members listened to each program, by name, in-app only. F3-18: an elder creates/edits/cancels clan activities, verified members notified and reminded, shown on the Year Planner read-only. ST1-02/ST1-03: Media sees empty gates after the deadline and marks a no-show gate not-observed, notifying the elder.
- [ ] Design it (spec): `/architect clan portal and Super T`
Spec: not yet captured
SRS: F3-07, F3-11, F3-12, F3-13, F3-14, F3-15, F3-18, ST1-01, ST1-02, ST1-03, ST1-04, ST1-05, M8-02

### 29. Mentorship confirmation and reminders · planned
Track A. Make sure a mentorship-completion claim is confirmed by Administration before it counts, and nudge members who haven't finished.
**Done when:** F2-14: a change to "Completed" waits for Administration to confirm; the previous status stands until then; the member is notified either way. A2-04: Administration confirms or rejects, with an optional note on rejection. F2-15/M2-09: a verified member who hasn't completed mentorship sees a gentle Home banner plus a monthly push, stopping once confirmed.
- [ ] Design it (spec): `/architect mentorship confirmation and reminders`
Spec: not yet captured
SRS: F2-14, F2-15, A2-04, M2-09, F4-21

### 30. Google sign-in · in-progress
Track A. Turn on the Google sign-in path that's already wired on the backend, so newcomers aren't forced through email/password.
**Done when:** F1-01: a newcomer can create an account with Google, landing as a visitor exactly like email/password sign-up. Backend wiring already exists; this switches it on in production.
- [ ] Design remaining work (spec): `/architect Google sign-in`
Spec: not yet captured
SRS: F1-01 · code: `convex/auth.ts`, `README.md` (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` env vars already documented, optional)

## Pilot

### 21. Store readiness and launch content · planned · Alpha
Track Both (pilot fortnight). Get the app store-ready and the church's real content in place before ministers are invited — app identifiers, privacy pages, and the actual welcome/programs/giving/department content real users will see.
**Done when:** F5-10: app name, icon, splash, identifiers under the church, privacy policy and deletion pages, store privacy questionnaires, screenshots, and review notes explaining the giving flow are all in place. F5-12: Home welcome and vision, weekly programs, broadcast schedule, first devotionals, giving details and department descriptions are real before the pilot; Tower of Faith is completed by Real Estate after appointment.
- [ ] Build it: `/develop store readiness and launch content`
SRS: F5-10, F5-12

## Legend

**Tracks.** Track A (Andrew): backend-heavy and sensitive work — environments, permissions, profile lifecycle, notifications, shell, Administration, Pastoral, Finance/giving, radio core, clan portal/Super T. Track B: mostly screens and department features built on Track A's foundations. Andrew owns the Convex schema and all deployments; Track B proposes schema changes in its spec, Andrew merges them. Full mapping and dependencies: `spec/BUILD-PLAN.md` §2.1 and §4.4.

**Phase = build week**, from `spec/BUILD-PLAN.md` §4 (Track A's fixed weekly schedule; Track B's "earliest start" week from its dependency-ordered queue). A feature whose Track A work spans two weeks (9, 18) is phased at its start week.

**Status**, set here from the SRS's own per-story `Built`/`Change`/`New` labels (as of commit `b847b7e`, the day this scope was written), not re-derived from scratch: `existing` = every mapped story is `Built`; `in-progress` = at least one mapped story is `Built` or `Change` (code exists, even if partial or wrong) alongside others still `New`; `planned` = every mapped story is `New` (nothing built yet). A handful of `in-progress`/`existing` claims are corroborated directly against the code (see each feature's code pointer); the rest rely on the SRS's own recent audit.

**Needs a decision**, applied by tier: every GA and Beta feature gets `/architect` first (this build's own loop always starts there — see `spec/BUILD-PLAN.md` §1 — and the SRS's key rules leave real design choices open: data models, third-party integrations, multi-screen flows). The two Alpha features (1, done; 21) skip straight to `/develop`, per the build plan's own tier definition ("small UI changes and content").

**Fallback priority** (Must / Should / Could, from `spec/BUILD-PLAN.md` §3 and §5) is not repeated per feature here — if the extra Track B capacity doesn't materialize, `spec/BUILD-PLAN.md` §5 is the source for what moves to December, in Could-then-Should order from the bottom.

**Pointer line** (`SRS: <story IDs>` and, once building starts, `code in <path>`): the SRS story IDs cited here are seeds for the spec's acceptance criteria, not the acceptance criteria themselves — `/architect` grows them into the full spec.
