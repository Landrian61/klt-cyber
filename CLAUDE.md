# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KLT Cyber Church** — a pnpm monorepo containing a React Native mobile app, a Next.js web admin portal, and a shared Convex backend for Kingdom Life Tabernacle (KLT) Cyber Church.

- `apps/mobile` — Expo SDK 54 / React Native 0.81 / React 19, Expo Router (file-based routing). The consumer-facing app.
- `apps/admin` — Next.js 16 (App Router) / React 19 / Tailwind CSS 4. The administrative portal for role-holders, deployed to Cloudflare via `@opennextjs/cloudflare`.
- `convex/` (repo root, not inside an app) — the single backend: schema, queries, mutations, actions, and the Better Auth component. Both apps talk to it directly via the generated Convex client — there is no REST/GraphQL layer.
- `packages/shared` (`@klt-cyber/shared`) — cross-platform TypeScript: enums, Zod validators, shared business logic. Both apps and Convex import from here; this is the single source of truth for any type/schema used in more than one place.
- `packages/config` (`@klt-cyber/config`) — shared tsconfig base only, no runtime code.

Read `docs/ARCHITECTURE.md` for the full system design and reasoning, `docs/DATA_MODEL.md` for schema evolution, `docs/ROLES.md` for the RBAC model, and `docs/INTERFACE_SPEC.md` for the visual design language. These docs are authoritative — when a doc and the code disagree, that's a bug to flag, not to silently resolve either way.

## Commands

All run from the **repo root** (pnpm workspace — do not `cd` into an app to run these):

```bash
pnpm install              # install all workspaces (root + both apps + both packages)

pnpm convex                # start Convex dev backend (watch + push schema/functions) — keep running
pnpm admin                 # Next.js dev server → http://localhost:3000
pnpm mobile                 # Expo dev server (press 'a'/'i' or scan QR with Expo Go)
pnpm mobile:android         # launch mobile on Android device/emulator
pnpm mobile:ios             # launch mobile on iOS simulator (macOS only)

pnpm lint                  # lint every workspace package (pnpm -r run lint)
pnpm test                  # run tests across all packages (pnpm -r run test)
```

Per-package equivalents (`pnpm --filter <pkg> <script>`), useful when only one workspace is relevant:

```bash
pnpm --filter @klt-cyber/shared test        # vitest run — the shared validators' unit tests
pnpm --filter @klt-cyber/shared test -- roles.test.ts   # a single test file
pnpm --filter mobile lint                    # expo lint
pnpm --filter admin build                    # next build
pnpm exec convex run seed:clans              # run a specific Convex seed function
pnpm exec convex run seed:bootstrapSystemAdmin
pnpm exec convex env set <KEY> "<value>"     # set a Convex deployment env var
```

Testing is intentionally light for MVP. `packages/shared` (Zod validators) is the one place unit tests (Vitest) are expected — add one whenever you add a schema there. Convex mutations with non-trivial business logic get tests via Convex's test helpers when it's a judgment call worth making. UI tests are deferred entirely.

### First-time local setup

Each developer runs their own Convex dev deployment. Three terminals: `pnpm convex` (leave running — pushes schema/function changes live), `pnpm admin`, `pnpm mobile`. Each surface needs its own git-ignored `.env.local` — see `README.md` §2–5 or `docs/CONTRIBUTING.md` §3 for exact variable names (`CONVEX_URL`/`CONVEX_SITE_URL` variants per app, `BETTER_AUTH_SECRET`, `SITE_URL`, `SEED_ADMIN_EMAIL`). Node **22.13+** is required — `pnpm@11` uses `node:sqlite` and crashes on Node 20.

Windows note: don't keep the repo under a OneDrive-synced folder — OneDrive's file locks cause intermittent `EPERM`/permission errors during `pnpm install` and with Metro's watcher.

## Architecture

### System shape

Two client apps and one backend, connected only through Convex's typed client (no intermediate API) and through `@klt-cyber/shared` for cross-platform contracts:

```
Mobile (Expo)  ──┐                    ┌── Web Admin (Next.js)
                 ├─► @klt-cyber/shared ┤
                 │                     │
                 └────► Convex (schema, mutations, queries, Better Auth component) ◄────┘
```

- **Convex is the only backend.** Domain schema (`convex/schema.ts`) + business-logic functions (`convex/*.ts`) + the `@convex-dev/better-auth` component (its own auth tables, namespaced, never written to directly). Both apps import generated types from `convex/_generated/`.
- **Auth identity vs. app identity are deliberately separate.** Better Auth owns credentials/sessions/OAuth accounts. Our own `users` table (linked by `authId`) owns base identity and authorization. This isolates the alpha-stage `@convex-dev/better-auth` API from domain data — if its API shifts, only the integration adapts, not the schema.
- **`packages/shared` is the contract layer.** Any enum, Zod schema, or pure business function used by more than one component (mobile, admin, or Convex) belongs here. Do not duplicate a validator in two places — that's how contract drift happens. When you change something here, update every consumer in the same change; TypeScript will point you at them.

### Two orthogonal permission dimensions (critical — do not conflate)

1. **Consumer lifecycle** — `users.role`: `"visitor" | "member"`. Governs what the **mobile app** shows. A freshly signed-up user is a visitor; completing the member-profile wizard promotes them to member. Self-service, no approval needed for this baseline transition.
2. **Administrative authority** — `roleAssignments` table (zero or more scoped/unscoped grants per user: `system_admin`, `clan_elder`, `hod`, `department_admin` — the latter two scoped to a `departmentId`). Governs what the **web admin portal** shows.

These never overlap — never gate a consumer-facing mobile feature on `roleAssignments`, and never put an authority check on `users.role`. A user can be a visitor *and* `system_admin` simultaneously (e.g. the seed-bootstrapped admin). See `docs/ROLES.md` for the full role catalog, access matrix, and the checklist (§8) for adding a new role type — it touches `packages/shared`, `convex/schema.ts`, `convex/roles.ts`, and two docs in the same change.

### Web admin authorization — three enforcement layers

1. **Middleware** (`apps/admin/middleware.ts`, per request) — coarse gate: authenticated + ≥1 active `roleAssignments` record, else redirect to `/unauthorized`. Does a real Convex round-trip per navigation (not a JWT-cached role), since Next middleware can't use `next/headers()`.
2. **Route-group layouts** (per module, e.g. `app/(admin)/system-admin/*`) — verify the caller holds the *specific* role type the module requires.
3. **Convex functions** (per operation) — every mutation/sensitive query re-checks identity + role via `ctx.auth.getUserIdentity()` and a role-assertion helper (see `convex/lib/authz.ts`). This is the real guard; layers 1–2 are UX, not security boundaries — never rely on only one layer.

The URL is the source of truth for "which role am I acting as" — no session-stored "current role." A multi-role user switches context by navigating to a different `/system-admin/*`, `/church-admin/*`, etc. prefix, not via a setting.

### Monorepo specifics worth knowing before touching config

- `pnpm-workspace.yaml` sets `nodeLinker: hoisted` — required because Metro (React Native's bundler) breaks on pnpm's default symlinked `node_modules`. Don't "fix" this to the pnpm default.
- `apps/mobile/metro.config.js` is monorepo-aware (watches the workspace root, resolves from both app- and root-level `node_modules`); treat it as load-bearing plumbing.
- `convex/` lives at the repo root, not nested in an app — the Convex CLI expects it there, and it's genuinely shared infra, not owned by either client.
- Admin app has no `src/` directory (`apps/admin/app`, `apps/admin/lib`, `apps/admin/components` are top-level) — mirror that when adding files.
- Mobile screens live in `apps/mobile/app/**` (Expo Router, file-based); admin screens live in `apps/admin/app/(admin)/**` and `app/(auth)/**` (Next.js route groups).

### Data model conventions (see `docs/DATA_MODEL.md` for full schema)

- **Approval-state shape** — records needing verification carry an embedded `{ status, verifiedBy?, verifiedAt?, note? }` object rather than scattered boolean/date fields.
- **`activityLogs`** — append-only-by-convention audit trail (`actorUserId`, `action`, optional `targetType`/`targetId`/`metadata`); write one whenever a mutation performs a consequential state change (signup, role change, verification, etc.).
- **Embed vs. reference** — fixed-size nested data embeds in the parent document; anything unbounded or independently queried becomes its own table.
- **Cardinality without unique indexes** — Convex has no unique-index enforcement, so "one Elder per clan," "one Church Administrator," etc. are enforced in the mutation itself via revoke-and-replace (both events logged to `activityLogs`) or reject-on-conflict, not at the schema level.
- Any schema change to `convex/schema.ts` must land with a corresponding update to `docs/DATA_MODEL.md` in the same change — reviewers treat a schema/doc mismatch as a defect.

### Content ownership

The mobile app is a *view* over content the web admin produces (weekly program, events, announcements, radio schedule, themes) — it does not author authoritative content itself. When adding a mobile feature that displays data, the first question is "which admin module owns this content?" — if no admin surface owns it and it isn't static seeded content, it isn't ready to build.

## Design system — "Kingdom Radiant" (mobile)

`docs/INTERFACE_SPEC.md` is authoritative for all UI work — read it before styling anything, and prefer the `klt-cyber-brand` skill / `.claude/commands/{new-screen,new-component,setup-theme,check-spec}.md` workflows over ad hoc styling.

- **Warm cream base** (`#FDF8F0`) — never cold white.
- **No-Line Rule** — no 1px solid borders; depth comes from tonal surface shifts and a warm blue-glow shadow.
- **Palette** — Gold `#C47F08`/`#DD9814` (primary), Crimson/red `#C10810` (secondary — LIVE, priority, active nav; the KLT logo red), Royal Blue `#12306E`/`#2C63D9` (tertiary — heroes, community).
- **Typography** — Bricolage Grotesque (display), Plus Jakarta Sans (body/UI), Spline Sans Mono (amounts, timers, references).
- 8-point spacing grid; fully-rounded buttons/pills; every interaction gets haptic feedback and spring-physics animation (Reanimated + Gesture Handler).
- Mobile gating is friendly, not blocking — visitors get real (if narrower) access; member-only areas nudge rather than wall off.

## Git conventions

Conventional Commits, enforced by a commit-msg hook: `<type>(<scope>): <subject>` — types `feat|fix|chore|docs|refactor|test|ci|build|style`; scope is typically `mobile|admin|convex|shared|config|docs` or a feature area. Branches: `feature/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `hotfix/…` (off `prod`). PRs target `main` (auto-deploys to staging); `main` → `prod` promotion is a deliberate, tech-lead-driven PR (auto-deploys to production). Merges are rebase-and-merge — keep `main` linear. Full workflow, PR template, and the "what to update where" doc-ownership table are in `docs/CONTRIBUTING.md`.
