# KLT Cyber Church

A premium digital sanctuary for **Kingdom Life Tabernacle (KLT) Cyber Church** — a React Native mobile app, a Next.js web admin dashboard, and a shared Convex backend, all in one pnpm monorepo.

| Surface | Lives in | README |
|---------|----------|--------|
| 📱 Mobile app (Expo / React Native) | [`apps/mobile`](apps/mobile) | [apps/mobile/README.md](apps/mobile/README.md) |
| 🖥️ Web admin (Next.js) | [`apps/admin`](apps/admin) | [apps/admin/README.md](apps/admin/README.md) |
| ⚙️ Backend (Convex) | [`convex`](convex) | this document |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | [pnpm workspaces](https://pnpm.io/workspaces) |
| Mobile | [Expo SDK 54](https://expo.dev) · React Native 0.81 · React 19 · [Expo Router 6](https://docs.expo.dev/router/introduction/) |
| Web admin | [Next.js 16](https://nextjs.org) (App Router) · React 19 · [Tailwind CSS 4](https://tailwindcss.com) |
| Backend | [Convex](https://convex.dev) (real-time DB + serverless functions) |
| Auth | [Better Auth](https://better-auth.com) via [`@convex-dev/better-auth`](https://github.com/get-convex/better-auth) |
| Language | TypeScript 5.9 (strict) |

## Repository Layout

```
klt-cyber/
├── apps/
│   ├── mobile/          Expo / React Native app      (workspace package "mobile")
│   └── admin/           Next.js web admin dashboard   (workspace package "admin")
├── convex/              Convex backend — schema, queries, mutations, auth, seed
├── packages/
│   ├── shared/          Code shared across apps (@klt-cyber/shared)
│   └── config/          Shared TypeScript config (@klt-cyber/config)
├── docs/                DATA_MODEL · DEPLOYMENT · INTERFACE_SPEC · AUTH_QA_CHECKLIST
├── pnpm-workspace.yaml  Workspace globs + hoisted node-linker (required by Metro)
└── package.json         Root workspace scripts
```

---

## Getting Started

This guide gets the **full stack running locally** — backend, web admin, and mobile app — against your own Convex deployment.

### 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| [Node.js](https://nodejs.org) **22.13+** | Required — `pnpm@11` uses the `node:sqlite` builtin and will crash on Node 20. Use an even LTS (`22.x`). |
| [pnpm](https://pnpm.io/installation) **11+** | The workspace package manager (`npm i -g pnpm`). |
| A [**Convex account**](https://dashboard.convex.dev) | Free. The backend, auth, and all data live here — the apps will not run without one. |
| An [**Expo account**](https://expo.dev/signup) | Only needed to run the mobile app on a device / make builds. |
| Mobile runtime | [Expo Go](https://expo.dev/go) on a phone, **or** an Android emulator / iOS simulator (macOS). |

> Google sign-in is optional; email + password works out of the box.

### 2. Clone & install

```bash
git clone https://github.com/Landrian61/klt-cyber.git
cd klt-cyber
pnpm install        # installs every workspace (mobile + admin + backend) from the root
```

### 3. Provision the Convex backend

From the repo root, start Convex. On first run it opens a browser to log in (or create your account), then prompts you to create a project:

```bash
pnpm convex         # = convex dev — keep this running; it watches & pushes functions
```

This writes your deployment coordinates to **`.env.local`** at the repo root (`CONVEX_DEPLOYMENT`, `CONVEX_URL`). Your deployment gets two origins you'll reuse below:

- **`.convex.cloud`** — the API host (the Convex client connects here)
- **`.convex.site`** — the HTTP-actions host (Better Auth runs here)

### 4. Configure backend environment variables

Better Auth needs a couple of variables **on the Convex deployment**. Set them with `convex env set` (writes to your dev deployment — no `--prod` for local work):

```bash
# Required: a 32-byte secret for Better Auth
pnpm exec convex env set BETTER_AUTH_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# Required: the trusted origin / cross-domain site URL (your local admin)
pnpm exec convex env set SITE_URL "http://localhost:3000"

# Optional: bootstrap a system admin (see step 6)
pnpm exec convex env set SEED_ADMIN_EMAIL "you@example.com"

# Optional: enable Google sign-in (only active when BOTH are set)
pnpm exec convex env set GOOGLE_CLIENT_ID "…"
pnpm exec convex env set GOOGLE_CLIENT_SECRET "…"
```

> `CONVEX_SITE_URL` is **auto-provided** by Convex — do not set it.

### 5. Configure the app environment files

Each app reads its own git-ignored `.env.local`, pointing at the deployment from step 3. Use the `CONVEX_URL` value from the root `.env.local`; the `.site` URL is the same host with a `.site` suffix.

**`apps/mobile/.env.local`**
```bash
EXPO_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site
```

**`apps/admin/.env.local`**
```bash
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

See each app's README for app-specific details: [mobile](apps/mobile/README.md) · [admin](apps/admin/README.md).

### 6. Seed initial data (optional)

The backend ships idempotent seed functions in [`convex/seed.ts`](convex/seed.ts):

```bash
pnpm exec convex run seed:clans              # create the 12 canonical clans
pnpm exec convex run seed:bootstrapSystemAdmin   # promote SEED_ADMIN_EMAIL to system admin
```

> `bootstrapSystemAdmin` requires that user to have **signed up first** and `SEED_ADMIN_EMAIL` to be set (step 4).

### 7. Run the apps

Use a separate terminal per process, all from the repo root:

```bash
pnpm convex          # backend (leave running — pushes function changes live)
pnpm admin           # web admin → http://localhost:3000
pnpm mobile          # mobile dev server (scan the QR with Expo Go, or press 'a' / 'i')
```

---

## Workspace Scripts

All run from the repo root:

| Script | Action |
|--------|--------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm convex` | Start the Convex dev backend (watch & push) |
| `pnpm admin` | Start the web admin (Next.js dev server) |
| `pnpm mobile` | Start the Expo dev server |
| `pnpm mobile:android` | Start mobile on a connected Android device / emulator |
| `pnpm mobile:ios` | Start mobile on the iOS simulator (macOS) |
| `pnpm lint` | Lint every workspace package |
| `pnpm test` | Run tests across all packages |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No such built-in module: node:sqlite` during install/build | Your Node is < 22.13. `pnpm@11` requires Node **22.13+** — upgrade Node. |
| Metro can't resolve a workspace package | The repo uses a hoisted node-linker (`pnpm-workspace.yaml`). Re-run `pnpm install` from the **root**, not inside an app. |
| Auth errors / `SITE_URL` undefined | Set `SITE_URL` and `BETTER_AUTH_SECRET` on the Convex deployment (step 4). |
| App can't reach the backend | Confirm the app's `.env.local` URLs match your `CONVEX_URL` (step 5) and `pnpm convex` is running. |

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | How each surface goes from commit → running environment |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Convex schema, tables, and relationships |
| [`docs/INTERFACE_SPEC.md`](docs/INTERFACE_SPEC.md) | Authoritative design & interface specification |
| [`docs/AUTH_QA_CHECKLIST.md`](docs/AUTH_QA_CHECKLIST.md) | Authentication QA checklist |

## License

Private — Kingdom Life Tabernacle. All rights reserved.
