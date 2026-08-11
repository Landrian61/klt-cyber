# KLT Cyber Church — Copilot Instructions

A pnpm monorepo: `apps/mobile` (Expo/React Native), `apps/admin` (Next.js App Router admin portal), `convex/` (the single backend, at the repo root), `packages/shared` (cross-platform enums, Zod validators — the source of truth for anything used in more than one place).

Authoritative docs: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ROLES.md`, `docs/INTERFACE_SPEC.md`, `docs/CONTRIBUTING.md`. When code and these disagree, that's a defect to raise — not to silently resolve either way.

---

## Frontend design norm (applies to all UI work)

Three layers, in this order of preference: **the design system**, then **shadcn/ui**, then **a restrained touch of anime.js**.

Reach for an existing component before writing markup. Reach for a token before writing a value. Add motion only when it carries meaning.

### Non-negotiables

- **Warm parchment, never cold white.** Page backgrounds use the parchment surface tokens; `#FFFFFF` is only for elevated "lifted parchment" cards. Text is `on-surface` (`#1c1c18`), never pure black.
- **No-Line Rule — no 1px solid borders for structure.** Depth comes from tonal surface steps plus an ambient shadow, e.g. `rounded-xl bg-surface-lowest shadow-[0_8px_32px_rgba(28,28,24,0.04)]`. Not `border border-border`.
- **No hardcoded colours.** No raw Tailwind palette (`bg-amber-100`, `text-blue-700`) and no hex literals in components. Use the semantic tokens from `@theme` in `apps/admin/app/globals.css` (or `constants/theme` on mobile), or a `Badge` variant.
- **Never redefine the tokens** in a scoped override block. One token set, one look, across every portal.
- **Typography by role.** `font-display` (Bricolage Grotesque) for headings ≥18px only; `font-body` (Plus Jakarta Sans) for all UI text; `font-mono` (Spline Sans Mono) for numerals — counts, amounts, IDs. Never a display face on nav/badges/labels; never a UI label in mono.

### Components (web — `apps/admin`)

Look in this order, and do not re-implement what already exists:

1. `components/ui/` — bespoke and already design-correct: `DataTable`, `Table`, `EmptyState`, `Pagination`, `SearchInput`, `FilterBar`, `StatCard`, `Heading`, `ActionButton`, `ImageUpload`.
2. `components/shadcn/` — the shadcn primitives. Add missing ones with `npx shadcn@latest add <component> -c apps/admin`; never hand-write one.
3. `components/brand/`, `components/motion/` — the Kingdom Radiant canvas and motion primitives.

Loading uses `Skeleton`; empty uses `EmptyState`; status uses `Badge` variants. Destructive actions confirm in a `Dialog`; additive actions open a `Sheet`. Filter/sort/page state lives in the URL, not `useState`. Server components own data + authorization; `"use client"` only where interaction requires it.

### Motion (anime.js)

Prefer the existing primitives in `apps/admin/components/motion/`: `Reveal` (default admin entrance), `CountUp` (stat numerals), `Stagger` and `TextReveal` (louder landing/auth choreography).

Writing raw anime.js is fine for something genuinely new, but follow the house pattern: apply the hidden start state in **JS, not CSS** (so no-JS and reduced-motion users get plain visible content), **always** bail out on `prefers-reduced-motion`, and always clean up on unmount.

Admin motion is short (~300–500ms) and small (~8–12px travel). Hover/press feedback is CSS, not anime.js. Never animate on every keystroke, never block interaction behind an entrance, never animate layout-shifting properties when `transform`/`opacity` will do.

---

## Backend (Convex)

- Any enum, Zod schema, or pure function used by more than one component belongs in `packages/shared` — never duplicated.
- Authorization is enforced in three layers: middleware (coarse: ≥1 active role), route-group layout (the specific role), and **every Convex mutation/sensitive query** (the real guard — `convex/lib/authz.ts` helpers). Never rely on only one.
- Two orthogonal permission dimensions that must never be conflated: `users.role` (`visitor`/`member` — consumer lifecycle, governs mobile) vs `roleAssignments` (`system_admin`/`clan_elder`/`hod`/`department_admin` — administrative authority, governs the web portal).
- Any change to `convex/schema.ts` requires the matching update to `docs/DATA_MODEL.md` in the same PR.
- Convex has no unique indexes — cardinality rules ("one HOD per department") are enforced in the mutation via revoke-and-replace, and every consequential state change writes an `activityLogs` entry.

## Conventions

Conventional Commits (`feat|fix|chore|docs|refactor|test|ci|build|style`, scoped `mobile|admin|convex|shared|docs`), enforced by a commit-msg hook. Branches `feature/…`, `fix/…`, `chore/…`. PRs target `main`; merges are rebase-and-merge. TypeScript strict, functional components, named exports.
