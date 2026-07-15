# KLT Cyber Church — Architecture

> The technical shape of the project. Companion to `docs/VISION.md` (product)
> and `docs/DATA_MODEL.md` (data). Where those two documents say *what* and
> *why*, this one says *how*. New engineers should read this to build correct
> mental models before making changes to system topology or introducing new
> technologies.

---

## 1. Purpose

This document describes how the KLT Cyber Church system is put together — the
components, the relationships between them, the technology choices, and the
patterns that hold across the codebase. It records not just what exists but
*why it exists that way*, so future decisions build on the reasoning rather
than reflexively "improving" architecture that has intent.

Diagrams are omitted for now — we describe topology in prose and ASCII trees.
Visual diagrams will be added when the architecture stabilizes and would
benefit from a reader-friendly view.

---

## 2. System topology

The project has four components: two client applications, one shared package,
and one backend. All four live in a single monorepo.

```
    ┌────────────────────┐          ┌────────────────────┐
    │    Mobile App      │          │  Web Admin Portal  │
    │  React Native /    │          │    Next.js 15 /    │
    │   Expo SDK 54      │          │    App Router      │
    │  (apps/mobile)     │          │   (apps/admin)     │
    └─────────┬──────────┘          └──────────┬─────────┘
              │                                 │
              │       ┌─────────────────┐       │
              └──────►│  @klt-cyber/    │◄──────┘
                      │     shared      │
                      │  (packages/     │
                      │    shared)      │
                      └─────────────────┘
              │                                 │
              │      Better Auth Convex         │
              │     client + Convex client      │
              │                                 │
              └────────────────┬────────────────┘
                               ▼
                    ┌────────────────────────┐
                    │     Convex Backend     │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │  Better Auth     │  │
                    │  │  component       │  │
                    │  │  (auth tables)   │  │
                    │  └──────────────────┘  │
                    │  ┌──────────────────┐  │
                    │  │  Domain tables   │  │
                    │  │  + mutations     │  │
                    │  │  + queries       │  │
                    │  └──────────────────┘  │
                    └────────────────────────┘
```

**Mobile app** is the consumer-facing product — where visitors and members
engage with the ministry. React Native via Expo SDK 54.

**Web admin portal** is the administrative product — where role-holders run
church operations. Next.js 15 App Router deployed to Cloudflare Pages.

**Shared package** is a workspace-local package (`@klt-cyber/shared`) that
holds cross-platform TypeScript: enums, Zod validators, shared business logic.
Both client apps depend on it.

**Convex backend** is the single source of truth for all data and business
operations. It hosts our domain schema and functions, and it runs the Better
Auth component in its own namespace for authentication.

Both client apps talk to Convex directly via its typed client. There is no
intermediate API server, no REST layer, no GraphQL. Convex generates
TypeScript types from the schema, and both apps import those types via
`convex/_generated/`. This is Convex-idiomatic and eliminates a whole class of
contract-drift bugs.

---

## 3. Monorepo layout

```
klt-cyber/
├── apps/
│   ├── mobile/          Expo SDK 54 React Native app
│   └── admin/           Next.js 15 web admin portal
│
├── packages/
│   ├── shared/          Cross-platform types, Zod validators
│   └── config/          Shared TypeScript, ESLint, Prettier bases
│
├── convex/              Convex backend (schema, functions, config)
│   ├── _generated/      Auto-generated types (git-ignored)
│   ├── schema.ts        Domain schema
│   ├── auth.ts          Better Auth setup + onCreateUser hook
│   ├── http.ts          HTTP routes (Better Auth)
│   ├── convex.config.ts Convex component registration
│   ├── users.ts, profile.ts, roles.ts, admin.ts, ...
│   └── seed.ts          Idempotent seed mutations (clans, admin bootstrap)
│
├── docs/                Governance + specifications (this document lives here)
├── .github/workflows/   CI/CD pipelines
│
├── package.json         Workspace orchestration + shared dev tooling
├── pnpm-workspace.yaml  Workspace boundaries
├── .npmrc               node-linker=hoisted, shamefully-hoist=true
├── tsconfig.json        Root TS project references
└── CLAUDE.md, README.md
```

A few things worth knowing:

- **`convex/` is at the project root, not inside an app.** Convex is shared
  infrastructure; neither client app "owns" it. The Convex CLI expects it at
  the root by default.
- **`packages/shared` is where domain rules live in code.** Elder eligibility,
  HOD eligibility, mentorship attendance math, RBAC helpers — all of these
  will land here as pure functions consumed by Convex mutations *and* by
  client-side form validation. This is the single biggest leverage point
  against the church spec's complexity.
- **`packages/config` holds only tooling bases** — a shared `tsconfig.base.json`
  and any shared ESLint/Prettier config. No runtime code.
- **`apps/mobile/metro.config.js`** is the one piece of monorepo plumbing that
  needs care. It tells Metro to watch the workspace root and resolve modules
  from both the app's `node_modules` and the root's. Without it, Metro's
  hierarchical resolution breaks in workspace layouts.

---

## 4. Technology choices

Each choice has reasoning. Understanding the *why* prevents accidental
regressions.

### 4.1 Package manager: pnpm

pnpm with the `hoisted` linker gives the best React Native monorepo support
today. pnpm's default symlink-based `node_modules` layout breaks Metro; the
hoisted linker sidesteps that by producing an npm-shaped `node_modules` while
retaining workspaces. `shamefully-hoist=true` further ensures dependencies
resolve consistently across mobile, web, and Convex.

Version pinned via `packageManager` in root `package.json` so all engineers
and CI run the same pnpm version.

### 4.2 Backend: Convex

Convex is the reason a monorepo works so cleanly for this project. It provides
a typed real-time database, serverless functions (mutations, queries, actions,
crons), file storage, and its own scheduler — all with generated TypeScript
types that both apps import directly. There is no separate API server to
maintain, no REST contract to keep in sync, no data serialization boundary.

Convex's reactive queries mean the mobile app updates in real time when data
changes — critical for features like live listenership on Reign Radio and
immediate reflection of role assignments.

Cost profile suits the project: 500 users × 200 peak concurrent stays well
within Convex's Starter free tier. If usage grows past those limits, the
paid tier is priced by usage, not seats.

### 4.3 Authentication: Better Auth via `@convex-dev/better-auth`

Chosen for cost (free, open source), platform completeness (Expo + Next.js
both supported), and integration path (an official Convex component).

**Notable caveat.** The `@convex-dev/better-auth` component is currently in
alpha and its API shifts between versions. We mitigate this by keeping our
domain data (`users` and `memberProfiles` tables) fully separate from the
Better Auth component's own tables. Better Auth owns identity; we own the
church-domain profile. If Better Auth's API changes materially, our data
model is unaffected — we adapt the integration, not the schema.

Versions are pinned tightly. Upgrades happen deliberately, tested end-to-end,
not automatically.

### 4.4 Mobile: Expo SDK 54 / React Native

Existing before this architecture doc — the mobile app was scaffolded first
and this project builds around it. Expo gives cross-platform reach with a
single codebase, EAS for builds and over-the-air updates, and Expo Router for
file-based navigation.

React Native 0.81 + React 19, aligned with what Next.js 15 expects on the web
side.

### 4.5 Web admin: Next.js 15 / App Router

App Router with server components suits an admin portal where much of the UI
is data-heavy and benefits from server-side rendering. Next.js also has the
best Cloudflare Pages support via `@cloudflare/next-on-pages`.

No `src` directory (keeps the layout simple), no ESLint scaffold from
`create-next-app` (we set our own), Tailwind CSS for styling with tokens
derived from `INTERFACE_SPEC.md`.

### 4.6 Web hosting: Cloudflare Pages

Free tier, global edge network, automatic builds on git push, seamless
GitHub integration. Preview URLs on every branch. Pairs cleanly with
Cloudflare R2 for media without egress costs.

Two Pages deployments will exist: staging (from `main`) and production (from
`prod`). See §6.

### 4.7 Media storage: Cloudflare R2

S3-compatible object storage with **no egress fees** — this matters for radio
banner images, profile pictures, library resources, and eventually broadcast
recordings, all of which are read frequently. Egress cost is where cloud
storage bills usually surprise you; R2 removes that risk.

### 4.8 Radio streaming: Caster.fm

Existing church subscription. The mobile app embeds the Caster.fm stream URL;
we do not host audio ourselves.

### 4.9 SMS: Africa's Talking

Uganda-optimized pricing significantly beats Twilio and comparable global
providers for our region. Integration deferred beyond MVP but the vendor
choice is locked.

### 4.10 Push notifications: Firebase Cloud Messaging

Standard, free, cross-platform. Expo has native integration.

### 4.11 Transactional email: Resend

Simple API, generous free tier, developer-friendly.

### 4.12 Error monitoring: Sentry

Free tier covers small-scale usage. Cross-platform (mobile + web + backend).

### 4.13 Mobile CI: EAS

Expo's build and update service. Provides binary builds for App Store / Play
Store and over-the-air JavaScript updates through named channels (see §6.4).

---

## 5. How the pieces connect — three flows

### 5.1 Sign-up flow

A new user signs up on mobile with email and password.

1. Mobile UI captures credentials, calls the Better Auth client.
2. Better Auth (via its Convex component) creates its own `user`, `session`,
   and `account` records in its namespace.
3. The Better Auth `onCreateUser` hook fires. Our code (in `convex/auth.ts`)
   creates a matching `users` row in our domain schema with:
   `role: "visitor"`, `profileCompleted: false`, `status: "active"`, and any
   name/avatar the provider supplied (populated when signing up via Google;
   empty for email/password).
4. The same transaction writes an `activityLogs` entry with
   `action: "user.signup"`.
5. Session token returned to mobile, stored via `expo-secure-store`.
6. Mobile app's `getMyAccount` query now returns `{ user, profile: null,
   activeRoles: [] }` — treated as visitor.

The critical property: the Better Auth identity and our domain `users` row
are always created atomically. There is no window in which auth succeeds but
the domain user is missing.

### 5.2 Web sign-in and role check

A user signs into the web admin portal.

1. Web UI (Next.js) captures credentials, calls Better Auth on the client.
2. Better Auth authenticates against its Convex component; session
   established server-side.
3. Client redirects to `/select-role`.
4. Route middleware (`apps/admin/middleware.ts`) enforces the web-portal
   authorization invariant: it fetches the user's active role assignments
   via Convex and checks that the count is ≥ 1.
5. If ≥ 1: request proceeds. `/select-role` renders the picker.
6. If 0: middleware redirects to `/unauthorized`. User is signed out (or
   given the option to sign out) and directed toward the mobile app.
7. When the user picks a role, the URL prefix (`/system-admin/...`,
   `/elder/{clanId}/...`) scopes the rest of the portal experience.

Middleware re-checks on every request, so a user whose last role is revoked
mid-session gets kicked out on their next navigation.

### 5.3 Real-time reactivity — Radio broadcast published

The Radio Administrator adds a broadcast for tomorrow evening.

1. Radio Admin UI (web) submits the broadcast form; calls a Convex mutation.
2. The mutation validates input, checks caller has active `radio_admin` role,
   inserts a new record into the (future) `broadcasts` table.
3. Every mobile app currently subscribed to a "upcoming broadcasts" query
   receives the update over the Convex live-query connection — no polling,
   no manual refresh.
4. Users see the new broadcast appear in Reign Radio's upcoming list within
   seconds of the admin clicking Save.

This pattern — write on one client, appears on every subscribed client —
underpins listener presence, live comments, role-assignment reflection on the
target user's device, and other real-time features.

---

## 6. Environment and deployment

### 6.1 Branch model

Two long-lived branches. No `staging` branch.

- **`main`** is the integration branch. All feature branches merge here.
  Every push to `main` auto-deploys to the **staging** environment.
- **`prod`** is the production branch. Promotion from `main` to `prod` is
  deliberate — an explicit PR by the tech lead, with a review of what's
  changing. Every push to `prod` auto-deploys to **production**.

Feature branches follow the convention `feature/<short-name>` or
`fix/<short-name>` and are opened as PRs against `main`. See
`docs/CONTRIBUTING.md` for the full flow.

### 6.2 Environment map

| Component | Local dev | Staging (`main`) | Production (`prod`) |
|-----------|-----------|-----------------|--------------------|
| Convex | Per-developer dev deployment (`npx convex dev`) | Shared staging deployment | Shared production deployment |
| Web admin | `localhost:3000` | `*.pages.dev` on Cloudflare Pages | Production domain on Cloudflare Pages |
| Mobile | Expo Go or local dev build | EAS Update `staging` channel + optional staging binaries via EAS Build | EAS Update `production` channel + App Store / Play Store binaries |
| Better Auth secrets | Per-dev `.env.local` | Convex staging env | Convex production env |
| Cloudflare R2 | Shared dev bucket | Staging bucket | Production bucket |

Every developer runs their own isolated Convex dev deployment locally — this
means schema changes and experimental mutations don't collide across
engineers. Shared environments (staging, production) are pushed to only via
CI on the corresponding branch.

### 6.3 Deployment pipeline

- **Cloudflare Pages** watches the repo directly and auto-deploys on every
  push to `main` and `prod`.
- **Convex** is deployed via a GitHub Actions workflow triggered by pushes to
  `main` (→ staging) and `prod` (→ production). The workflow runs
  `pnpm exec convex deploy` against the appropriate deploy key.
- **EAS Update** publishes OTA JavaScript-only updates via a GitHub Actions
  workflow on the same branch triggers, targeting the `staging` and
  `production` channels respectively.
- **EAS Build** (binary builds for App Store / Play Store) is invoked
  manually when native dependencies or app metadata change. Most feature
  work is JS-only and reaches devices via OTA.

Secrets live in three places, mirrored per environment:

- **Convex environment variables** (`convex env set` per deployment):
  `BETTER_AUTH_SECRET`, `SITE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `SEED_ADMIN_EMAIL`.
- **Cloudflare Pages environment variables** (staging + production):
  `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_SITE_URL`.
- **GitHub Actions secrets**: `CONVEX_DEPLOY_KEY_STAGING`,
  `CONVEX_DEPLOY_KEY_PROD`, `EXPO_TOKEN`.

Nothing sensitive lives in the repository. Ever.

### 6.4 Mobile update model

Two update paths that engineers should mentally separate:

- **OTA updates** (fast). Any JavaScript-only change — a new screen, a bug
  fix, a copy tweak — is published via EAS Update. Users receive it on next
  app launch. No store review. This is how most feature work reaches
  production.
- **Binary builds** (slow). Required only when native dependencies change,
  the Expo SDK upgrades, permissions change, or app icon/splash/name change.
  Goes through TestFlight and Play Internal for staging, App Store and Play
  Store review for production. Days-to-weeks turnaround.

Design features to be OTA-deliverable whenever possible. If a PR introduces a
native change, flag it early — it changes the delivery timeline materially.

---

## 7. Third-party services

| Service | Role | Cost profile at MVP scale |
|---------|------|--------------------------|
| Convex | Backend, database, auth hosting | Free (Starter tier) |
| Cloudflare Pages | Web hosting, edge CDN | Free |
| Cloudflare R2 | Media storage | Free tier; no egress fees at any scale |
| Africa's Talking | SMS (deferred) | Pay-per-message; Uganda-optimized |
| EAS (Expo) | Mobile builds + OTA updates | Free tier for OTA; EAS Production for builds |
| Firebase Cloud Messaging | Push notifications | Free |
| Resend | Transactional email | Free tier |
| Sentry | Error monitoring | Free tier |
| Caster.fm | Radio streaming | Existing church subscription |

None of these services locks the project in irreversibly. Better Auth can be
swapped for Clerk without touching domain data (see §4.3). Cloudflare Pages
can be swapped for Vercel with a build config change. R2 can be swapped for
S3 or Backblaze. The one exception is Convex itself — moving off Convex would
be a project-defining migration. That risk is accepted knowingly given the
architectural leverage Convex provides.

---

## 8. Cross-cutting patterns

Patterns that recur across the codebase. Contributors should recognize them
and follow them rather than reinventing.

**The shared package is the single source of typed contracts.** Any enum,
literal union, Zod schema, or pure business function used by more than one
component belongs in `packages/shared`. Duplicating an enum in Convex and
again in mobile is a bug waiting to happen. When Convex needs a validator,
it imports from `@klt-cyber/shared`. When mobile validates a form, it imports
the same schema.

**`docs/DATA_MODEL.md` is the authority for schema changes.** Any change to
Convex tables, indexes, or the relationships between them requires an update
to `DATA_MODEL.md` in the same PR. Reviewers reject PRs where schema and doc
disagree. This discipline is the reason the schema stays stable across
increments.

**PR-driven increments.** Features ship as small, reviewable PRs against
`main`. Each PR corresponds to a scoped increment (schema + shared types +
mutations + UI + tests where warranted). See `docs/CONTRIBUTING.md` for
mechanics.

**Approval-state is a first-class shape.** Records requiring verification
carry an embedded `{ status, verifiedBy?, verifiedAt?, note? }` object rather
than scattered fields. Starting with `memberProfiles.clanApproval`; extends
across future modules.

**Web authorization is invariant on role assignments.** Middleware plus
route-group layouts enforce: a valid web session requires ≥ 1 active
`roleAssignments` record. Never work around this — extend it.

**Mobile gating is friendly, not blocking.** Visitors have real access to
Home, Radio, and Library. Member-only tabs surface a soft nudge, not a wall.
The visitor experience is welcoming — completing a profile is a choice, not
a forced funnel.

**Consumer lifecycle and administrative authority are orthogonal.** A user's
`role` (visitor / member) lives on the `users` table and describes consumer
progression. A user's administrative authority lives in `roleAssignments`.
These are independent dimensions and should never be conflated in queries,
UI, or permission checks.

**Admin publishes, mobile consumes.** The mobile app is a view over data
produced by the web admin portal. Weekly program, events, themes,
announcements, radio schedule and banner images, library resources —
everything the mobile app displays as content originates in an admin
surface. The mobile app does not author authoritative content; it renders
it. This constraint prevents mobile features from accidentally becoming
their own data sources, which would fragment authority and confuse
governance. Static seeded content — scripture of the day, initial library
resources — is the narrow exception, deployed once and curated via commits
until a real admin surface exists. When a new mobile feature is being
designed, the first question is always: *where does this content come from,
and which admin role owns it?* If no admin surface owns it and it isn't
seeded static content, the feature isn't ready to build.

---

## 9. What this document intentionally does not cover

- **Detailed schema definitions** — see `docs/DATA_MODEL.md`.
- **Visual design system, tokens, and components** — see
  `docs/INTERFACE_SPEC.md`.
- **Role types, scoping conventions, and RBAC details** — see
  `docs/ROLES.md`.
- **Contribution workflow, branch conventions, PR process, local setup** —
  see `docs/CONTRIBUTING.md`.
- **Individual API contracts** — see the Convex functions themselves; they
  are the contract, via generated types.

Duplicating those in this document would produce drift. Reference them
instead.

---

## 10. Related documents

- `docs/VISION.md` — product scope and guiding principles
- `docs/DATA_MODEL.md` — schema and its evolution
- `docs/INTERFACE_SPEC.md` — Sacred Curator design language
- `docs/ROLES.md` — RBAC model
- `docs/CONTRIBUTING.md` — how to contribute
- `docs/DEPLOYMENT.md` — deployment runbook (created when the pipeline lands)
- `KLT_Cyber_Church_APP.docx` — original church specification