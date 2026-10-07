# KLT Cyber Church App: Phase 01 Build Plan

| | |
|---|---|
| Version | 0.2 |
| Date | 30 September 2026 |
| Requirements | `spec/SRS.md` v1.0 |
| Method | jsmastery-pro feature loop |
| Target | **Full Phase 01 scope by the 16 November feature freeze; launch 29 November** |

This plan says **in what order** the SRS gets built, **how deeply** each feature is checked, and **who** builds it. The SRS says *what* to build; the feature loop's specs in `docs/specs/` say *how*. Once agreed, this plan is loaded into `docs/scope/scope.md` by `/scope`, which then tracks status.

---

## 1. The loop for every feature

```
/architect → /develop → /check verify → /test → /check review → /document → /sync
```

| Step | What it produces here | Rule for this project |
|---|---|---|
| `/architect` | A spec in `docs/specs/NNNN-name.md` with acceptance criteria AC-1, AC-2… | ACs come from the feature's SRS stories and key rules; the spec cites the story IDs. Skipped only when there is no open design question. |
| `/develop` | The code | Stops if it would invent an undecided design. Never deploys to Convex, never commits or pushes. |
| `/check verify` | Proof it works in the running app | On staging, against every AC, on web and on a real phone where relevant. |
| `/test` | Automated tests | Backend permission rules always get tests (NF-01, F5-09). |
| `/check review` | Fresh-model review | GA-tier features only. |
| `/document` | PR description and changelog entry | Per pull request. |
| `/sync` | AGENTS.md, scope and spec statuses updated | Last step before merge. |

A feature is **done** when its tier's loop is complete, it is merged, and it works on staging.

### 1.1 Loop depth (tier)

| Tier | Steps after `/develop` | Used for |
|---|---|---|
| **GA** | verify, test, fresh review, document | Permissions, privacy, deletion, giving details, notification audiences |
| **Beta** | verify, test, document | Most features (project default) |
| **Alpha** | verify, document | Small UI changes and content |
| Prototype | none | Never used |

### 1.2 Repo layout with the loop

| Path | Holds |
|---|---|
| `spec/SRS.md` | Requirements: what the product does (source of truth) |
| `docs/scope/` | The loop's build plan and feature status (created by `/scope`) |
| `docs/specs/` | The loop's design specs, one per feature (created by `/architect`) |
| `AGENTS.md`, `CLAUDE.md` | How to work in the code; kept current by `/sync` |

Specs cite SRS story IDs and never change requirements. A requirement change goes to `spec/SRS.md` by pull request first.

---

## 2. Capacity

| | Hours |
|---|---|
| Full Phase 01 build (features 1 to 32 except 21) | **224** |
| Build weeks (5 October to 13 November) | 6 |
| **Needed per week** | **about 38** |
| Andrew (Track A) | 24 a week, 140 in total |
| **Additional capacity needed (Track B)** | **about 14 to 15 a week, 84 in total** |

Track B can be a second developer, Naomi, or extra hours. Hours are the builder's time (prompting, reviewing, testing, merging), with loop overhead included. Each person running the loop needs their own Claude plan.

### 2.1 How the two tracks split

- **Track A (Andrew):** the backend-heavy and sensitive work: environments, permissions, profile lifecycle, notifications, shell, Administration, Pastoral, Finance and giving, radio core, clan portal and Super T.
- **Track B:** mostly screens and department features built on Track A's foundations: mobile screens, directory, Library, Real Estate, Hospitality and SMS, notification settings, analytics, Radio Insights.
- **Andrew owns the Convex schema and all Convex deployments.** Track B proposes schema changes in its spec; Andrew merges them.
- One feature per branch and pull request; both tracks rebase on `main` daily to keep conflicts small.

---

## 3. Feature list

Hours include loop overhead. **Fallback priority** is only used if the extra capacity doesn't materialise (Section 5).

| # | Feature | SRS stories | Tier | Hours | Track | Fallback priority |
|---|---|---|---|---|---|---|
| 1 | Spec and repo cleanup | F5-01 | Alpha | 2 | A | Must |
| 2 | Staging and production environments, safe seeding, backups | F5-02 to F5-05, NF-15, NF-16 | Beta | 8 | A | Must |
| 3 | Error screens, Sentry, update channels | F5-06 to F5-08, M1-04, NF-06, NF-13, NF-14 | Beta | 6 | A | Must |
| 4 | Stay signed in | F1-09, NF-10 | Beta | 3 | A | Must |
| 5 | Remove suspension and web sign-up; move System Admin pages into Administration | F1-05, F1-02, F3-02, F3-03, A8-01 to A8-03 | GA | 5 | A | Must |
| 6 | Department-scoped permissions, portal access rules, permission tests | F3-01, F3-04, F3-05, F3-08, F3-09, F3-19, S1-03, F5-09, NF-01, NF-17 | GA | 10 | A | Must |
| 7 | Password reset and the five emails (Resend) | F1-03, F1-10, email rules | Beta | 6 | A | Must |
| 8 | Account deletion | F1-06 | GA | 5 | A | Must |
| 9 | Profile lifecycle core: pending edits, send-back, edit after verification, clan "I don't know", name and photo sync, spouse search fix, mentorship bug | F2-01 to F2-13, F2-16, F1-07, A2-02, A2-03, A2-05 | GA | 8 | A | Must |
| 10 | Notification targeting: appointment audiences, revocation notice, first-publish only, deep links to ended items | F4-01, F4-03 to F4-07, F4-12, F4-13, F3-10 | GA | 6 | A | Must |
| 11 | Cancel and restore a single program occurrence | A4-02, A4-03, F4-02, M2-05, M4-03 | Beta | 3 | A | Must |
| 12 | Mobile shell and Home slots | M1-01 to M1-03, M2-01 to M2-08, M8-01 | Beta | 5 | B | Must |
| 13 | Member directory with sharing | M5-01 to M5-05, F2-13, NF-02 | GA | 8 | B | Must |
| 14 | My Profile and settings | M6-01 to M6-07, F5-11 | Beta | 5 | B | Must |
| 15 | Updates "My groups", Events & Programs, add to calendar | M3-01 to M3-04, M4-01 to M4-04 | Beta | 5 | B | Must |
| 16 | Give and Finance giving settings | M9-01 to M9-08, FN1-01 to FN2-03 | GA | 8 | A | Must |
| 17 | Shared department shell | S1-01 to S6-02, F4-08, F4-14 to F4-18, F4-20 | GA | 14 | A | Must |
| 18 | Administration core: dashboard fix, directory contacts, departments and clans pages, events with times, audiences and cancel, year planner delete | A1-01 to A7-03, A3-05, F3-16, F4-15 | Beta | 10 | A | Must |
| 19 | Pastoral: Home content, church overview, Radio inbox | PS1-01 to PS4-01, R1-09 | GA | 8 | A | Must |
| 20 | Radio core: schedule, player, status, listening records, follow, recordings | R1-01 to R1-08, R2-01 to R2-06, RC1-01 to RC1-04, M2-04, NF-09 | Beta | 16 | A | Must |
| 21 | Store readiness and launch content | F5-10, F5-12 | Alpha | 5 | Both (pilot) | Pilot fortnight |
| 22 | Devotionals and past events | D1-01 to D1-04, P1-01 to P1-03, M2-03, M4-05 | Beta | 4 | B | Should |
| 23 | Clan portal and Super T | F3-07, F3-11 to F3-15, F3-18, ST1-01 to ST1-05, M8-02, Section 4.4 | GA | 14 | A | Should |
| 24 | Hospitality core: visitors, follow-ups, regulars, clan placement, reports | H1, H2, H4, H5, H6 | GA | 12 | B | Should |
| 25 | Library: catalogue, free content, stock | L1 to L3, M10-01 | Beta | 6 | B | Should |
| 26 | Real Estate: Tower of Faith and spaces to let | RE1, RE2, M7-01 to M7-03 | Beta | 7 | B | Should |
| 27 | Hospitality SMS (Africa's Talking) | H3-01 to H3-05 | GA | 6 | B | Should |
| 28 | Notification settings, web bell, images | F4-10, F4-11, F4-19, M6-05 | Beta | 6 | B | Should |
| 29 | Mentorship confirmation and reminders | F2-14, F2-15, A2-04, M2-09, F4-21 | Beta | 4 | A | Should |
| 30 | Google sign-in | F1-01 | Beta | 4 | A | Should |
| 31 | Platform analytics and cost register | F3-17, F1-11, A8-04, A8-05 | Beta | 6 | B | Could |
| 32 | Radio Insights with PDF and map | RI1-01 to RI1-09 | Beta | 14 | B | Could |

---

## 4. Schedule

### 4.1 Track A (Andrew)

| Week | Dates | Features | Hours | Milestone |
|---|---|---|---|---|
| 1 | 5 to 9 Oct | 1, 2, 3, 4, 5 | 24 | Clean repo on the SRS; staging and production live; users stay signed in |
| 2 | 12 to 16 Oct | 6, 7, 8, 11 | 24 | Permissions correct and tested; password reset; account deletion |
| 3 | 19 to 23 Oct | 17, 10, start 9 (4 h) | 24 | Department shell live; notifications reach only the right people |
| 4 | 26 to 30 Oct | finish 9 (4 h), 20, start 18 (4 h) | 24 | Profile lifecycle complete; live radio with listening records |
| 5 | 2 to 6 Nov | finish 18 (6 h), 16, 19 | 22 | Administration updated; giving works; Pastoral live |
| 6 | 9 to 13 Nov | 23, 29, 30 | 22 | Clan portal and Super T; mentorship reminders; Google sign-in |

### 4.2 Track B (additional capacity)

Track B works through this queue in order. Each item starts once its dependency has merged.

| Order | Feature | Hours | Earliest start | Depends on |
|---|---|---|---|---|
| 1 | 22 Devotionals and past events | 4 | Week 1 | 2 (staging) |
| 2 | 12 Mobile shell and Home slots | 5 | Week 2 | 3 |
| 3 | 15 Updates, Events & Programs, calendar | 5 | Week 2 | 3 |
| 4 | 31 Platform analytics and cost register | 6 | Week 2 | 5 |
| 5 | 25 Library | 6 | Week 3 | 17 |
| 6 | 26 Real Estate | 7 | Week 3 | 17 |
| 7 | 13 Member directory | 8 | Week 4 | 9 |
| 8 | 14 My Profile and settings | 5 | Week 4 | 9 |
| 9 | 28 Notification settings, web bell, images | 6 | Week 4 | 10 |
| 10 | 24 Hospitality core | 12 | Week 4 | 17 |
| 11 | 27 Hospitality SMS | 6 | Week 5 | 24, sender ID approved |
| 12 | 32 Radio Insights | 14 | Week 5 | 20 |
| | **Total** | **84** | | |

### 4.3 After the freeze

| Dates | Work |
|---|---|
| 16 to 20 Nov | Pilot with Custein and 3 to 5 ministers on production; fixes; feature 21 (store readiness, launch content); TestFlight and closed-testing builds submitted early in the week |
| 23 to 27 Nov | All ministers invited; leader appointments; verification; fixes |
| 29 Nov | Launch |

### 4.4 Key dependencies

2 before anything that deploys. 6 before 17, 18, 19. 17 before 24 to 26. 9 before 13, 14, 29. 10 before 28. 20 before 23 and 32.

---

## 5. Early warning: if the extra capacity doesn't arrive

| Checkpoint | Test | If it fails |
|---|---|---|
| **Fri 9 Oct** | Track B capacity confirmed (who, how many hours) and onboarded (SRS, loop, working rules) | Andrew continues Track A; Track B queue starts later from the top |
| **Fri 16 Oct** | Track A on plan (features 1 to 8 and 11 merged); Track B has merged at least items 1 to 3 | Re-estimate both tracks from real pace |
| **Fri 30 Oct** | Remaining hours fit before 13 Nov | Items move to December from the bottom of the fallback priority: Could first (32, 31), then Should in reverse order. The launch date holds. |

Anything moved to December ships in weekly updates before the app opens to the whole congregation: portal changes reach users immediately, mobile changes go out as over-the-air updates.

---

## 6. Open points

1. Who will provide the Track B capacity, and from when?
2. Tiers: GA (with fresh-model review) for permissions, privacy, deletion, giving and notification audiences. Confirm.