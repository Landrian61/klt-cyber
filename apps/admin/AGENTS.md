# Web admin (`apps/admin`)

## Overview

The Next.js admin portal for role holders (system admins, clan elders, HODs, department admins). It reads and writes Convex directly through the generated client and is deployed to Cloudflare Workers via `@opennextjs/cloudflare`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4, shadcn/ui (Radix), anime.js 4, Recharts, lucide-react
- `@convex-dev/better-auth` + `better-auth` for sessions
- Cloudflare Workers via OpenNext (`wrangler.jsonc`, `open-next.config.ts`)

## Key files

| File | Owns |
|---|---|
| `middleware.ts` | Coarse gate: signed in and holds at least one active role, else `/unauthorized` |
| `app/(admin)/**` | Role modules: `admin/`, `system-admin/`, `departments/`, `areas-of-service/` |
| `app/(auth)/**` | Sign in and related auth screens |
| `lib/convex.ts`, `lib/auth.ts`, `lib/auth-server.ts` | Convex client and Better Auth wiring |
| `components/ui/` | Bespoke design system components (`DataTable`, `EmptyState`, `StatCard`, ...) |
| `components/shadcn/` | shadcn primitives |
| `components/motion/` | anime.js primitives (`Reveal`, `CountUp`, `Stagger`, `TextReveal`) |

## Commands

```bash
pnpm admin                          # dev server on http://localhost:3000
pnpm --filter admin build           # next build
pnpm --filter admin preview         # OpenNext build + local Workers preview
pnpm --filter admin cf-typegen      # regenerate cloudflare-env.d.ts
```

There is no `lint` or `test` script here yet, so root `pnpm lint` and `pnpm test` skip this workspace.

## Conventions

- Root `AGENTS.md` rules apply (design system, authorization layers, No Line Rule). Load the `klt-cyber-web-ui` skill before any UI work.
- No `src/` directory: `app/`, `lib/`, `components/`, `hooks/` sit at the workspace root.
- The role module comes from the URL prefix, never from session state.

## Gotchas

- Deploys come from Cloudflare Workers Builds on push to `main`, not from the GitHub Actions staging workflow.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
