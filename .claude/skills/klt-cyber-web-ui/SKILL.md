---
name: klt-cyber-web-ui
description: >
  The mandatory design norm for the KLT Cyber Church WEB ADMIN portal (apps/admin —
  Next.js App Router + Tailwind v4 + shadcn/ui + anime.js). Use this skill whenever
  creating or modifying any web admin UI: pages, screens, layouts, route groups,
  components, dashboards, tables, lists, forms, dialogs, sheets, sidebars, top bars,
  navigation, cards, badges, buttons, inputs, empty states, loading states, charts,
  or animations. Also use when reviewing web UI code for design compliance, when
  choosing which component to reach for, or when the user mentions colors, fonts,
  spacing, borders, motion, transitions, or visual polish in apps/admin. This is the
  web counterpart to klt-cyber-brand (which covers the React Native mobile app only).
---

# KLT Cyber Web Admin — Design Norm

Every screen in `apps/admin` is built from three layers, in this order of preference:

1. **The design system** — Sacred Curator / Kingdom Radiant tokens + the bespoke primitives in `components/ui/`.
2. **shadcn/ui** — for anything interactive or structural (`components/shadcn/`).
3. **A restrained touch of anime.js** — motion that communicates, never decorates.

Reach for an existing component before writing markup. Reach for a token before writing a value. Reach for motion only when it carries meaning.

---

## 1. Non-negotiable rules

### The Warm Parchment Rule
Page backgrounds are warm parchment, **never cold white or grey**. `#FFFFFF` is reserved for `surface-lowest` — the "lifted parchment" cards that float above the page. Text is `on-surface` (`#1c1c18`), never pure black.

### The No-Line Rule
**No 1px solid borders for structure.** Depth comes from tonal surface steps plus an ambient shadow:

```tsx
// correct — lifted parchment
<div className="rounded-xl bg-surface-lowest shadow-[0_8px_32px_rgba(28,28,24,0.04)]" />

// wrong — hard line
<div className="rounded-xl border border-border bg-white" />
```

Before writing any `border-*`, ask whether a tonal shift (`bg-surface-low`, `hover:bg-surface-low`) or a shadcn `Separator` says it better. Table row separation, card edges, and section boundaries all use tone, not lines.

### Never redefine the tokens
Style with the global tokens. **Do not introduce a scoped palette override** (e.g. a `[data-section="…"]` block in `globals.css` that resets `--color-primary`/`--color-background`). The Administration portal used to do exactly that and drifted into a different product; it was deleted. One token set, one look.

### Never hardcode a raw Tailwind palette colour
`bg-amber-100`, `text-blue-700`, `#f8f9fa` are all wrong. Use semantic tokens or a `Badge` variant. If you need a tonal chip, pair the existing light/base tokens: `bg-primary-light text-primary`, `bg-royal-light text-royal`, `bg-success-light text-success`, `bg-error-light text-error`.

---

## 2. Tokens

Defined in `@theme` at the top of `apps/admin/app/globals.css` — read it before styling anything.

| Purpose | Tokens |
|---|---|
| Surfaces | `parchment` (page), `surface-low` (sections/deeper page), `surface-lowest` (lifted cards), `surface-container`, `surface-high` (hover/pressed) |
| Text | `on-surface`, `on-surface-variant` (secondary), `outline` (captions/quiet) |
| Primary (gold) | `primary`, `primary-container`, `primary-light`, `primary-dim`, `brand` |
| Accents | `crimson`/`crimson-light`, `royal`/`royal-light` |
| Semantic | `success`, `warning`, `error` (+ `-light` variants) |
| Dark canvas | `heaven-deep`, `heaven`, `heaven-bright`, `gold-radiant`, `gold-rich`, `gold-ink`, `sidebar-primary` |

**Typography — three faces, strictly by role:**

| Class | Face | Use |
|---|---|---|
| `font-display` | Bricolage Grotesque | Headings **18px and above only** |
| `font-body` | Plus Jakarta Sans | All UI: labels, body, nav, badges, buttons |
| `font-mono` | Spline Sans Mono | Numbers only: counts, amounts, IDs, dates-as-figures |

Never use `font-display` for navigation, badges, table headers, or form labels. Never set a UI label in `font-mono`. Stat numerals are **always** `font-mono` — that's the house signature.

---

## 3. Component selection

**Look here first, in this order:**

1. `components/ui/` — bespoke, already design-system-correct:
   `DataTable` (+ `Column`), `Table`/`THead`/`TBody`/`TR`/`TH`/`TD`, `EmptyState`, `Pagination`, `SearchInput`, `FilterBar`/`FilterChip`/`SegmentedFilter`, `StatCard`, `Heading`, `ActionButton`, `Button`, `ImageUpload`, `GoogleButton`
2. `components/shadcn/` — the shadcn primitives (import via `@/components/shadcn/<name>`)
3. `components/brand/` + `components/motion/` — Kingdom Radiant canvas and motion
4. Only then: new markup

**Do not build a bespoke primitive that duplicates one of these.** A hand-rolled modal, dropdown, or table is a bug — it drifts from the system, misses accessibility, and has to be migrated later. (This already happened once: a parallel `ui.tsx` grew inside the Administration portal and had to be deleted.)

When you need a shadcn component that isn't installed, add it with the CLI scoped to the workspace — never hand-write it:

```bash
npx shadcn@latest add <component> -c apps/admin
```

Then **load the `shadcn` skill** and follow its rules (composition, `asChild`, `data-icon`, `FieldGroup`/`Field` for forms, `Skeleton` for loading, `Badge` over styled spans, no manual z-index on overlays, `gap-*` over `space-y-*`, `size-*` over `w-/h-`, `cn()` for conditionals).

### Portal shell pattern
Both portals (`/system-admin`, `/admin`) share one shell — copy it exactly for any new portal:

- `layout.tsx` — server component: resolve identity + authority via `fetchAuthQuery(api.profile.getMyAccount)`, redirect on failure, seed `SidebarProvider defaultOpen` from the `sidebar_state` cookie (prevents a width flash), wrap content in `SidebarInset className="bg-surface-low"`.
- Sidebar — shadcn `Sidebar collapsible="icon"` with the heaven-blue gradient on `[data-slot=sidebar-inner]`, gold `data-[active=true]` items, `SidebarRail`.
- Top bar — sticky `bg-parchment/85 backdrop-blur-xl` glass, `SidebarTrigger` at far left, gradient `Avatar` + `DropdownMenu` at right.

Server components own data + authorization; client components own interaction. Filter/sort/page state belongs in the URL (`useSearchParams` + `router.replace`), not `useState` — it makes views shareable and bookmarkable.

---

## 4. Motion — anime.js

Motion is part of the norm, not an afterthought. It should make state changes **legible**: something arrived, something changed, something is loading. If an animation doesn't answer one of those, cut it.

**Use the existing primitives in `components/motion/` before writing raw anime.js:**

| Component | Use for |
|---|---|
| `Reveal` | Cards, list items, dashboard sections entering on mount — the default admin entrance |
| `CountUp` | Any stat numeral; also tweens when live Convex data changes |
| `Stagger` | The louder landing/auth/picker entrance on the Kingdom Radiant canvas |
| `TextReveal` | Hero headlines only (splits words, gilds a highlight word) |

Raw anime.js (`import { animate, stagger, utils, createSpring } from "animejs"`) is fine for something genuinely new — but follow the house pattern established in those files:

```tsx
// 1. Hidden start state applied by JS, never CSS — so no-JS and
//    reduced-motion users see plain, visible content.
// 2. Always bail out on prefers-reduced-motion.
// 3. Always clean up in the effect's return.
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (prefersReduced) return;
utils.set(items, { opacity: 0, translateY: 10 });
const animation = animate(items, { opacity: [0, 1], translateY: [10, 0], duration: 480, ease: "outQuad" });
return () => animation.pause();
```

**Taste:** admin motion is short (≈300–500ms) and small (≈8–12px travel). The 700ms+ spring-and-gild choreography belongs on the landing, auth, and Areas-of-Service canvases — not on a table of pending verifications. Never animate on every keystroke, never block interaction behind an entrance, never animate layout-shifting properties (`width`/`height`/`top`) when `transform`/`opacity` will do.

**Reduced motion is mandatory**, in every animated component, no exceptions. `globals.css` also freezes CSS animation globally under the preference — JS-driven motion must opt out itself.

Hover/press feedback is CSS, not anime.js: `transition-all hover:-translate-y-0.5 hover:shadow-…` on cards, `active:scale-[0.98]` on buttons.

---

## 5. Before you submit web UI code

1. No `border` used as a structural line — tone or `Separator` instead.
2. No raw Tailwind palette colours, no hex literals; semantic tokens only.
3. No new scoped token override blocks in `globals.css`.
4. `font-display` only ≥18px headings; every numeral in `font-mono`.
5. An existing `components/ui` / `components/shadcn` component reused rather than re-implemented.
6. Loading uses `Skeleton`; empty uses `EmptyState`; status uses `Badge` variants.
7. Every animation bails on `prefers-reduced-motion` and cleans up on unmount.
8. Interactive elements are keyboard-reachable and have an accessible name; the global gold `:focus-visible` ring is not suppressed.
9. Destructive actions confirm in a `Dialog`; additive actions open a `Sheet` (the house interaction split).
10. `"use client"` only where interaction actually requires it — keep data + authorization on the server.

---

## Related

- `docs/INTERFACE_SPEC.md` — the authoritative design specification (this skill is the working subset).
- `klt-cyber-brand` skill — same design language for the React Native mobile app.
- `shadcn` skill — component APIs, composition rules, and the CLI.
