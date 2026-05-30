# KLT Cyber — Web Admin

The administrative dashboard for KLT Cyber Church — member management, roles, and content administration. Built with **Next.js 16** (App Router), **React 19**, and **Tailwind CSS 4**, talking to the shared Convex backend.

> Part of the [klt-cyber monorepo](../../README.md). Complete the **root setup first** — this app needs the shared Convex backend running.

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) · React 19 |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Backend | [Convex](https://convex.dev) client + [Better Auth](https://better-auth.com) |
| Deployment | [Cloudflare Workers](https://workers.cloudflare.com) via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) |
| Language | TypeScript 5 |

## Setup

### 1. Prerequisites

Complete the [root Getting Started](../../README.md#getting-started): Node 22.13+, pnpm, and a running Convex deployment with `SITE_URL` + `BETTER_AUTH_SECRET` configured.

### 2. Environment

Create `apps/admin/.env.local` pointing at your Convex deployment. `NEXT_PUBLIC_*` vars are inlined into the client bundle and are **public** by design.

```bash
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> The origin that actually gates auth is **`SITE_URL` on the Convex deployment** (set during root setup), which must match this app's origin (`http://localhost:3000` locally) for the cross-domain auth flow to trust it.

### 3. Run

From the **repo root**:

```bash
pnpm admin            # → http://localhost:3000
```

Ensure `pnpm convex` is running in another terminal so the dashboard has a backend.

## Project Structure

```
app/                    Next.js App Router
  (admin)/              Authenticated admin pages
  (auth)/               Sign-in / auth pages
  api/auth/[...all]/    Better Auth proxy route (same-origin)
  providers.tsx         Convex + auth client providers
public/                 Static assets
next.config.ts          Next.js config (OpenNext dev parity, Turbopack root)
wrangler.jsonc          Cloudflare Worker config (nodejs_compat + assets)
open-next.config.ts     OpenNext adapter config
```

## Scripts

| Script | Action |
|--------|--------|
| `next dev` (`pnpm admin` from root) | Local dev server |
| `pnpm --filter admin build` | Production Next.js build |
| `pnpm --filter admin preview` | Build + preview the Cloudflare Worker locally |
| `pnpm --filter admin deploy` | Build + deploy the Cloudflare Worker |
| `pnpm --filter admin cf-typegen` | Regenerate Cloudflare env types |

## Deployment

Deployed to **Cloudflare Workers** (not Pages) via the OpenNext adapter, which runs the full Node.js runtime required by Better Auth's `node:crypto`. Pushes to `main` are built and deployed automatically by Cloudflare Workers Builds (Git integration) — there is no GitHub Actions job for the web admin.

See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) §6 for the exact Cloudflare dashboard settings and environment variables.
