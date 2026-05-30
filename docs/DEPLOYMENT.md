# KLT Cyber — Deployment

> **Status:** Staging pipeline (this PR). Production wiring — the `production`
> branch, a dedicated production Convex project, and the first mobile binary
> build — lands in **PR 7**. Sections marked _(PR 7)_ are placeholders.

This document is the source of truth for how the three deployable surfaces of
KLT Cyber — the **Convex backend**, the **web admin** (`apps/admin`), and the
**mobile app** (`apps/mobile`) — get from a commit to a running environment.

---

## 1. Architecture: branch → environment

There is one long-lived branch per environment. A push to that branch deploys
that environment. No manual deploy command is the normal path — CI and
Cloudflare's Git integration do it.

| Branch | Environment | Convex | Web admin | Mobile |
|---|---|---|---|---|
| `main` | **staging** | `klt-cyber` project's **prod** deployment (treated as staging until PR 7) | Cloudflare Workers `klt-cyber-admin` | EAS Update `staging` channel |
| `production` _(PR 7)_ | **production** | separate **production Convex project** _(PR 7)_ | separate Cloudflare Workers env _(PR 7)_ | EAS Update `production` channel |

> **Why the project's prod deployment is "staging" for now:** Convex projects
> have one `dev` and one `prod` deployment. We do not yet have a second Convex
> project, so this PR uses the existing `klt-cyber` project's **prod**
> deployment as the staging backend. PR 7 creates a distinct production project
> and re-points `main` → that-project-staging while `production` → prod.

---

## 2. Deployment matrix

| Surface | How it deploys | Trigger | Mechanism | Notes |
|---|---|---|---|---|
| **Convex backend** | `pnpm exec convex deploy` | push to `main` | GitHub Actions job `convex-deploy` in `.github/workflows/deploy-staging.yml` | `CONVEX_DEPLOY_KEY` encodes the target deployment — no `--prod` flag needed |
| **Web admin** | `opennextjs-cloudflare build && … deploy` | push to `main` | **Cloudflare Workers Builds** native Git integration (NOT in the GitHub workflow) | Root dir `apps/admin`; OpenNext adapter on Workers (see §6) |
| **Mobile JS (OTA)** | `eas update --branch staging` | push to `main` | GitHub Actions job `mobile-update` | Re-bundles JS only; no app-store round trip. See §5 |
| **Mobile binary** | `eas build --profile preview` | **manual / deferred** | EAS Build | First binary build is **PR 7**. Profiles are configured now (`apps/mobile/eas.json`) |

The **web admin is deliberately not a job in the GitHub workflow** — Cloudflare
Workers Builds watches the repo itself and deploys on push. Adding a CI job too
would double-deploy.

---

## 3. Environment variables

### 3.1 Conventions

| Prefix | Surface | When resolved | Where set |
|---|---|---|---|
| `EXPO_PUBLIC_*` | mobile | **inlined into the JS bundle** at build time (binary) **and** at update time (OTA) | `apps/mobile/eas.json` profile `env` (binary) + GitHub repo **variables** (OTA, see §4.3) |
| `NEXT_PUBLIC_*` | web | inlined into the client bundle at build time | Cloudflare Workers Builds env vars |
| _(unprefixed)_ | Convex deployment | read at function runtime | Convex deployment env (`convex env set --prod`) |

> `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` values are **public** — they are baked into
> client bundles a user can read. The Convex URL is public by design. Never put a
> secret behind these prefixes.

### 3.2 Mobile (`apps/mobile`)

Both are required — the Convex client uses the first, the Better Auth Expo
client uses the second (`apps/mobile/lib/convex.ts`, `apps/mobile/lib/auth.ts`):

| Var | Value | Notes |
|---|---|---|
| `EXPO_PUBLIC_CONVEX_URL` | `<staging-convex-url>` (`*.convex.cloud`) | baked into binary (`eas.json` `preview` profile) and OTA bundle |
| `EXPO_PUBLIC_CONVEX_SITE_URL` | `<staging-convex-site-url>` (`*.convex.site`) | HTTP-actions origin Better Auth talks to directly from mobile |

### 3.3 Web admin (`apps/admin`) — set in Cloudflare Workers Builds

| Var | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `<staging-convex-url>` (`*.convex.cloud`) | used by the Convex client; `convexSiteUrl` is derived from it |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `<staging-convex-site-url>` (`*.convex.site`) | optional explicit override of the derived `.site` origin |
| `NEXT_PUBLIC_SITE_URL` | the Cloudflare admin URL | **reserved** — not read by current code (the web client uses the same-origin `/api/auth` proxy with no `baseURL`). Set for forward-compat |
| `NODE_VERSION` | `22` | Cloudflare build image does not auto-detect |

> The origin that actually gates auth is **`SITE_URL` on the Convex deployment**
> (below), not `NEXT_PUBLIC_SITE_URL` — that is what makes the admin a trusted
> origin and powers the `crossDomain` flow.

### 3.4 Convex deployment (staging) — set with `convex env set --prod`

| Var | Value | Notes |
|---|---|---|
| `SITE_URL` | the Cloudflare admin URL | trusted origin + `crossDomain` site URL. Filled after the Cloudflare URL is assigned |
| `BETTER_AUTH_SECRET` | a **new** 32-byte hex value (distinct from dev) | read by Better Auth internally |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console | **optional** — Google sign-in is enabled only when both are set (`convex/auth.ts`) |
| `SEED_ADMIN_EMAIL` | the bootstrap admin email | used by `convex/seed.ts:promoteSeedAdmin` |
| `CONVEX_SITE_URL` | — | **auto-provided by Convex**; do not set. Used as Better Auth `baseURL` |

---

## 4. How to deploy each component

### 4.1 Convex backend — automatic on push to `main`

The `convex-deploy` job runs `pnpm exec convex deploy` with `CONVEX_DEPLOY_KEY`.
The key (a **production deploy key** generated in the Convex dashboard) encodes
the target deployment, so the deploy is non-interactive and needs no `--prod`.

Manual equivalent (rarely needed): `CONVEX_DEPLOY_KEY=… pnpm exec convex deploy`.

Setting/reading deployment env vars from a workstation:

```sh
pnpm exec convex env set --prod NAME 'value'   # write
pnpm exec convex env list --prod               # read
```

### 4.2 Web admin — automatic via Cloudflare Workers Builds

Cloudflare watches the repo (Git integration). On push to `main` it runs the
configured build (`npx opennextjs-cloudflare build`) and deploys
(`npx opennextjs-cloudflare deploy`) the `klt-cyber-admin` Worker. See §6 for
the exact dashboard settings. There is **no GitHub Actions job** for the web.

### 4.3 Mobile JS (OTA) — automatic on push to `main`

The `mobile-update` job runs `eas update --branch staging --message <commit>
--non-interactive`. The `staging` channel (set on the `preview` build profile)
is bound to the `staging` branch, so any binary on that channel picks up the
update on next launch.

Because `EXPO_PUBLIC_*` vars are **re-inlined into the OTA bundle at publish
time**, the job injects them from GitHub repository **variables**
(`EXPO_PUBLIC_CONVEX_URL_STAGING`, `EXPO_PUBLIC_CONVEX_SITE_URL_STAGING`). These
must stay equal to the `eas.json` `preview` profile `env` (which governs binary
builds) or a binary and its OTA updates would point at different backends.

---

## 5. Mobile: OTA update vs. binary build

| | OTA update (`eas update`) | Binary build (`eas build`) |
|---|---|---|
| Ships | JS bundle + assets only | full native app (APK / AAB / IPA) |
| Speed | seconds, no store review | minutes + store/distribution step |
| Use when | JS/React changes, bug fixes, copy, styling | native deps change, app config / permissions change, `runtimeVersion` fingerprint changes, first install |
| In this pipeline | **automatic** on push to `main` (`staging` channel) | **deferred to PR 7** (profiles ready in `eas.json`) |

**Runtime version:** `app.json` uses `runtimeVersion: { policy: "fingerprint" }`.
An OTA update only reaches binaries whose native fingerprint matches the update.
When native code/config changes the fingerprint, a **new binary build is
required** — OTA alone cannot ship that change. `updates.url` points at
`https://u.expo.dev/<projectId>`.

---

## 6. Cloudflare Workers + OpenNext (web admin)

The admin is **Next.js 16** with middleware and a Better Auth proxy route. It is
deployed with **`@opennextjs/cloudflare` on Cloudflare Workers**, not Cloudflare
Pages: the legacy `@cloudflare/next-on-pages` adapter is deprecated for Next 16
and is edge-runtime-only, which cannot run Better Auth's `node:crypto`. OpenNext
runs the **full Node.js runtime** via the `nodejs_compat` flag.

**Repo files (committed):**
- `apps/admin/wrangler.jsonc` — Worker config; `nodejs_compat` + assets binding
- `apps/admin/open-next.config.ts` — OpenNext adapter config (defaults)
- `apps/admin/next.config.ts` — calls `initOpenNextCloudflareForDev()` for parity in `next dev`
- `apps/admin/package.json` — `@opennextjs/cloudflare` dep, `wrangler` devDep, `preview`/`deploy`/`cf-typegen` scripts

**Cloudflare Workers Builds dashboard settings:**

| Field | Value |
|---|---|
| Source | Workers & Pages → Create → Workers → Connect to Git → this repo |
| Root directory | `apps/admin` |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |
| Build var `NODE_VERSION` | `22` |
| Env vars | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_SITE_URL` (§3.3) |

> **pnpm monorepo note:** Cloudflare runs `pnpm install` at the repo root across
> all workspaces before building `apps/admin`. The root `pnpm-lock.yaml` must be
> committed and in sync. pnpm version comes from the root `packageManager` field.

---

## 7. Secret & key locations

> _Not the values — only where they live. Filled in at first deploy (Step 8)._

| Secret / key | Lives in | Used by |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | GitHub repo **secrets** | `convex-deploy` workflow job |
| `EXPO_TOKEN` | GitHub repo **secrets** | `mobile-update` workflow job |
| `EXPO_PUBLIC_CONVEX_URL_STAGING` | GitHub repo **variables** (non-secret) | `mobile-update` OTA bundle |
| `EXPO_PUBLIC_CONVEX_SITE_URL_STAGING` | GitHub repo **variables** (non-secret) | `mobile-update` OTA bundle |
| `BETTER_AUTH_SECRET` | **Convex** deployment env | Better Auth (backend) |
| `SITE_URL`, `SEED_ADMIN_EMAIL`, `GOOGLE_CLIENT_ID/SECRET` | **Convex** deployment env | `convex/auth.ts`, `convex/seed.ts` |
| `NEXT_PUBLIC_*` | **Cloudflare** Workers Builds env | admin build |
| `EXPO_PUBLIC_*` (binary) | `apps/mobile/eas.json` profile `env` (public, committed) | `eas build` |

No secret values are ever committed to the repo.

---

## 8. Live coordinates _(filled at first deploy — Step 8)_

| | URL / id |
|---|---|
| Cloudflare admin (staging) | `<cloudflare-admin-url>` _(pending first successful Workers build)_ |
| Convex staging deployment | `https://polite-lemming-570.convex.cloud` (site: `https://polite-lemming-570.convex.site`) |
| Convex staging dashboard | `https://dashboard.convex.dev/d/polite-lemming-570` |
| GitHub Actions workflow | `.github/workflows/deploy-staging.yml` (trigger: push to `main`) |
| EAS project | `6f0edc13-211f-441d-a389-8f8996676df4` (owner `landrian12`, slug `klt-cyber`) |

---

## 9. Hotfix process _(placeholder — fleshed out in PR 7)_

Until the `production` branch exists, "hotfix" = push the fix to `main`:
- **JS-only fix:** push → `mobile-update` ships an OTA to `staging`; Cloudflare
  redeploys the web; Convex redeploys. Live in minutes.
- **Native fix:** OTA cannot ship it — a new `eas build` is required (PR 7).

PR 7 will define the real production hotfix flow (cherry-pick to `production`,
fast-track deploy, and the binary-vs-OTA decision tree under load).
