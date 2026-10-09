# KLT Cyber — Deployment

> **Status:** Staging and production both have real, separate homes as of
> 2026-10-07: separate Convex projects, separate Cloudflare Workers, separate
> EAS Update channels, and (as of 2026-10-08, credentials verified live) separate
> R2 buckets. As of 2026-10-09, production deploys automatically too —
> `deploy-prod.yml` is live on the `prod` branch and has run for real (§4.4).
> Daily backups with a proven restore procedure exist for both environments
> (`spec/BACKUPS.md`), pending one Cloudflare API token to activate. Track
> remaining items against `docs/scope/scope.md` row 2 /
> spec 0001, not as finished here.

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
| `main` | **staging** | `klt-cyber` project's **prod** deployment (doubles as staging — see note) | Cloudflare Workers `klt-cyber` | EAS Update `staging` channel |
| `prod` | **production** | `klt-cyber-prod` project's **prod** deployment (`superb-dog-305`) | Cloudflare Workers `klt-cyber-prod` | EAS Update `production` channel |

> **Why the `klt-cyber` project's prod deployment is "staging":** Convex
> projects have one `dev` and one `prod` deployment. Rather than create a third
> Convex project just to get a dedicated staging slot, `main` keeps deploying
> to `klt-cyber`'s own prod deployment, same as always — only the new
> `klt-cyber-prod` project (created 2026-10-07) is dedicated to real
> production. This means `grandiose-falcon-452` (`klt-cyber-prod`'s *dev*
> deployment) has no role in either pipeline; it exists only as that project's
> personal local-dev deployment, same as any other Convex project's dev slot.

> **Cloudflare Worker names deliberately differ**, `klt-cyber` vs.
> `klt-cyber-prod` (`apps/admin/wrangler.jsonc`'s `name` field) — on purpose,
> and only on the `prod` branch. Reverting that to match `main` would point
> both Cloudflare projects at the same Worker, and the second one to deploy
> would silently overwrite the first.

---

## 2. Deployment matrix

| Surface | How it deploys | Trigger | Mechanism | Notes |
|---|---|---|---|---|
| **Convex backend (staging)** | `pnpm exec convex deploy` | push to `main` | GitHub Actions job `convex-deploy` in `.github/workflows/deploy-staging.yml` | `CONVEX_DEPLOY_KEY` encodes the target deployment — no `--prod` flag needed |
| **Convex backend (production)** | `pnpm exec convex deploy` | push to `prod` | GitHub Actions job `convex-deploy` in `.github/workflows/deploy-prod.yml` | **Automatic since 2026-10-09.** First deploy (2026-10-07) was by hand before this existed — see §4.4 |
| **Web admin (staging)** | `opennextjs-cloudflare build && … deploy` | push to `main` | **Cloudflare Workers Builds** native Git integration, project `klt-cyber` (NOT in the GitHub workflow) | Root dir `apps/admin`; OpenNext adapter on Workers (see §6) |
| **Web admin (production)** | `opennextjs-cloudflare build && … deploy` | push to `prod` | **Cloudflare Workers Builds** native Git integration, separate project `klt-cyber-prod` | Live since 2026-10-07; see §6 |
| **Mobile JS (OTA, staging)** | `eas update --branch staging` | push to `main` | GitHub Actions job `mobile-update` | Re-bundles JS only; no app-store round trip. See §5 |
| **Mobile JS (OTA, production)** | `eas update --branch production` | push to `prod` | GitHub Actions job `mobile-update` in `deploy-prod.yml` | **Automatic since 2026-10-09.** The `production` channel is bound to the `production` branch on EAS |
| **Mobile binary** | `eas build --profile preview` / `production` | **manual / deferred** | EAS Build | Not yet run for either variant. Profiles are configured (`apps/mobile/eas.json`) |

The **web admin is deliberately not a job in the GitHub workflow**, for either
environment — Cloudflare Workers Builds watches the repo itself and deploys on
push. Adding a CI job too would double-deploy.

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

Both are required per environment — the Convex client uses the first, the
Better Auth Expo client uses the second (`apps/mobile/lib/convex.ts`,
`apps/mobile/lib/auth.ts`). Set in `apps/mobile/eas.json`, one block per build
profile:

| Profile | `EXPO_PUBLIC_CONVEX_URL` | `EXPO_PUBLIC_CONVEX_SITE_URL` |
|---|---|---|
| `preview` (staging) | `https://polite-lemming-570.convex.cloud` | `https://polite-lemming-570.convex.site` |
| `production` | `https://superb-dog-305.eu-west-1.convex.cloud` | `https://superb-dog-305.eu-west-1.convex.site` |

The staging-only `EXPO_PUBLIC_CONVEX_URL_STAGING` / `..._SITE_URL_STAGING`
GitHub repo variables (§4.3) re-inject the same `preview`-profile values at OTA
publish time. A `..._PRODUCTION` pair for the `production` profile is needed
before `deploy-prod.yml` can publish production OTAs — not created yet.

### 3.3 Web admin (`apps/admin`) — set in Cloudflare Workers Builds

Two separate Cloudflare projects, each with its own copy of these — `klt-cyber`
(staging) and `klt-cyber-prod` (production):

| Var | Staging value | Production value | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `https://polite-lemming-570.convex.cloud` | `https://superb-dog-305.eu-west-1.convex.cloud` | used by the Convex client; `convexSiteUrl` is derived from it |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://polite-lemming-570.convex.site` | `https://superb-dog-305.eu-west-1.convex.site` | optional explicit override of the derived `.site` origin |
| `NEXT_PUBLIC_SITE_URL` | — | — | **reserved** — not read by current code (the web client uses the same-origin `/api/auth` proxy with no `baseURL`). Not set on either project |
| `NODE_VERSION` | `22` | `22` | Cloudflare build image does not auto-detect |

> **These must be set as *Build* variables, not *Runtime* variables.**
> Cloudflare Workers Builds' dashboard has two separate sections that look
> similar — "Runtime variables and secrets" (bound into the deployed Worker,
> read at request time) and a separate build-scoped section near the Build
> command / Deploy command settings. `NEXT_PUBLIC_*` values get inlined by
> Next.js during `next build`, a plain Node subprocess that only sees real OS
> environment variables — it never sees the Runtime ones. Setting these only
> under "Runtime variables and secrets" produces a build that compiles fine
> but crashes collecting page data with `Cannot read properties of undefined
> (reading 'replace')` (from `apps/admin/lib/auth-server.ts`'s
> `process.env.NEXT_PUBLIC_CONVEX_URL!`) — this bit the first production
> deploy, on 2026-10-07, before the vars were moved to the right section.

> The origin that actually gates auth is **`SITE_URL` on the Convex deployment**
> (below), not `NEXT_PUBLIC_SITE_URL` — that is what makes the admin a trusted
> origin and powers the `crossDomain` flow.

### 3.4 Convex deployment — set with `convex env set --prod` (staging) or
`convex env set --deployment superb-dog-305` (production)

| Var | Staging | Production | Notes |
|---|---|---|---|
| `SITE_URL` | `https://klt-cyber.luswataandrew190.workers.dev` | `https://klt-cyber-prod.luswataandrew190.workers.dev` | trusted origin + `crossDomain` site URL |
| `BETTER_AUTH_SECRET` | set | set, **distinct value** from staging/dev | read by Better Auth internally |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | — | **optional** — Google sign-in is enabled only when both are set (`convex/auth.ts`). Not set on either deployment yet |
| `SEED_ADMIN_EMAIL` | set | set, to `luswataandrew190@gmail.com` | used by `convex/seed.ts:bootstrapSystemAdmin` (and the deprecated alias `promoteSeedAdmin`) |
| `R2_BUCKET`, `R2_ENDPOINT` | set | set — bucket `klt-cyber-media-prod` created 2026-10-08, CORS applied (`infra/r2-cors-prod.json`), these two vars set on `superb-dog-305` | the `@convex-dev/r2` component is registered for both deployments (`convex/convex.config.ts`), see `spec/STORAGE.md` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_TOKEN` | set | set (2026-10-08) — bucket-scoped API token, set via clipboard-piped `convex env set` so the values never touched chat or shell history |
| `CONVEX_SITE_URL` | — | — | **auto-provided by Convex**; do not set. Used as Better Auth `baseURL` |

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
(`npx opennextjs-cloudflare deploy`) the `klt-cyber` Worker. See §6 for
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

### 4.4 Production

Provisioned by hand on 2026-10-07 on purpose — get a real environment proven
out before wiring up automation — then automated on 2026-10-09 once that
proved solid. Both deploy paths now work the same way as staging's (§4.1–4.3):
push to `prod` → `deploy-prod.yml` runs `convex deploy` (via
`CONVEX_DEPLOY_KEY_PROD`) and `eas update --branch production` (via the
`EXPO_PUBLIC_CONVEX_URL_PRODUCTION` / `..._SITE_URL_PRODUCTION` repo
variables), same as `deploy-staging.yml` does for `main`. First run: PR #55,
2026-10-09, both jobs green (`convex-deploy` 37s, `mobile-update` 2m18s),
verified live afterward (admin root 200, Convex `/version` responding, a real
query returning data).

Web admin deploys the same way staging's does — Cloudflare Workers Builds
watching the repo directly, not a GitHub Actions job (§4.2, §6) — just a
second, separate Cloudflare project (`klt-cyber-prod`) watching `prod` instead
of `main`.

The one-time provisioning that got production to a deployable state in the
first place:

- **Convex.** New project `klt-cyber-prod` (not a second deployment on the
  existing `klt-cyber` project). Its `prod` deployment is `superb-dog-305`
  (`eu-west-1` — Convex EU data residency region; the existing `klt-cyber`
  project has no region segment, which is a cosmetic difference, not a
  mistake). First deploy:
  ```sh
  CONVEX_DEPLOYMENT=superb-dog-305 pnpm exec convex deploy
  ```
  `convex deploy` has no `--deployment` flag (unlike `convex env` / `convex
  run`); it resolves its target from `CONVEX_DEPLOYMENT` or `CONVEX_DEPLOY_KEY`
  instead. This only works from a workstation whose Convex CLI login already
  has access to the `klt-cyber-prod` project. The GitHub-only alternative,
  `CONVEX_DEPLOY_KEY_PROD` (repo secret, holds a production deploy key for
  `superb-dog-305`), is what `deploy-prod.yml` uses instead — see below.
- **Web admin.** A second Cloudflare Workers Builds project, `klt-cyber-prod`,
  connected to the `prod` branch (not a second environment on the `klt-cyber`
  project). Settings mirror §6, with the Worker name intentionally diverging
  (see §1) and the build-vs-runtime variable gotcha in §3.3. Live at
  `https://klt-cyber-prod.luswataandrew190.workers.dev`.
- **Mobile.** `apps/mobile/eas.json`'s `production` profile points at
  `superb-dog-305` instead of the old `REPLACE_WITH_PRODUCTION` placeholders.
  The EAS `production` channel exists and is bound to the `production` branch;
  `deploy-prod.yml` has published to it for real (above). No production
  *binary* has been built yet, though — OTA only so far, same gap §5 names for
  every environment.
- **Seeding.** `seed:clans`, `seed:departments`, `seed:bootstrapSystemAdmin`
  (after `luswataandrew190@gmail.com` signed up through the live production
  site once, so the mutation had a `users` row to promote), `seed:facilityDrafts`,
  `seed:weeklyPrograms` — all run against `superb-dog-305` directly, all
  idempotent, all confirmed via direct read after running. No sample-data seed
  (`churchAdminSeed`, `contentSeed`) has been run against production, nor
  should it be — both are guarded to refuse there.
- ~~Not yet done: `deploy-prod.yml` merged onto `prod`~~ — **done 2026-10-09**,
  PR #55. A push-triggered workflow only runs if it exists on the branch
  receiving the push, so merging that PR (bringing `prod` to current `main`)
  was itself the push that fired it for the first time — see above.

---

## 5. Mobile: OTA update vs. binary build

| | OTA update (`eas update`) | Binary build (`eas build`) |
|---|---|---|
| Ships | JS bundle + assets only | full native app (APK / AAB / IPA) |
| Speed | seconds, no store review | minutes + store/distribution step |
| Use when | JS/React changes, bug fixes, copy, styling | native deps change, app config / permissions change, `runtimeVersion` fingerprint changes, first install |
| In this pipeline | **automatic** on push to `main` (`staging` channel) | not yet run for either environment (profiles ready in `eas.json`) |

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

**Cloudflare Workers Builds dashboard settings** — two separate projects, same
settings shape, different production branch and Worker name:

| Field | `klt-cyber` (staging) | `klt-cyber-prod` (production) |
|---|---|---|
| Source | Workers & Pages → Create → Workers → Connect to Git → this repo | same repo, separate project |
| Production branch | `main` | `prod` |
| Root directory | `apps/admin` | `apps/admin` |
| Build command | `npx opennextjs-cloudflare build` | same |
| Deploy command | `npx opennextjs-cloudflare deploy` | same |
| Build var `NODE_VERSION` | `22` | `22` |
| Build vars | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_SITE_URL` (§3.3) | same three, production values — **under Build, not Runtime, variables** (§3.3) |
| Enable Preview builds | — | off (this repo has 40+ long-lived branches; leaving it on would build/deploy a preview Worker for every one of them) |

> **`apps/admin/wrangler.jsonc`'s `name` field differs by branch on purpose** —
> `"klt-cyber"` on `main`, `"klt-cyber-prod"` on `prod`. Wrangler deploys to
> whatever Worker that field names, regardless of which Cloudflare project
> triggered the build, so this is what actually keeps the two projects from
> deploying over each other. Don't "fix" it to match `main`.

> **pnpm monorepo note:** Cloudflare runs `pnpm install` at the repo root across
> all workspaces before building `apps/admin`. The root `pnpm-lock.yaml` must be
> committed and in sync. pnpm version comes from the root `packageManager` field.

---

## 7. Secret & key locations

> _Not the values — only where they live. Filled in at first deploy (Step 8)._

| Secret / key | Lives in | Used by |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | GitHub repo **secrets** | `convex-deploy` job, `deploy-staging.yml` (staging) |
| `CONVEX_DEPLOY_KEY_PROD` | GitHub repo **secrets** | `convex-deploy` job, `deploy-prod.yml` (production) — active since 2026-10-09 |
| `EXPO_TOKEN` | GitHub repo **secrets** | `mobile-update` job, both workflows |
| `EXPO_PUBLIC_CONVEX_URL_STAGING` / `..._SITE_URL_STAGING` | GitHub repo **variables** (non-secret) | `mobile-update` OTA bundle, staging |
| `EXPO_PUBLIC_CONVEX_URL_PRODUCTION` / `..._SITE_URL_PRODUCTION` | GitHub repo **variables** (non-secret), set 2026-10-09 | `mobile-update` OTA bundle, production |
| `CLOUDFLARE_API_TOKEN` | **not created yet** — needed before `backup.yml` can upload (`spec/BACKUPS.md`) | `wrangler r2 object put`, both backup jobs |
| `BETTER_AUTH_SECRET` | **Convex** deployment env, per deployment | Better Auth (backend) |
| `SITE_URL`, `SEED_ADMIN_EMAIL`, `GOOGLE_CLIENT_ID/SECRET` | **Convex** deployment env, per deployment | `convex/auth.ts`, `convex/seed.ts` |
| `R2_*` | **Convex** deployment env — set on staging, **not set on production** (§3.4, §10) | `@convex-dev/r2` component |
| `NEXT_PUBLIC_*` | **Cloudflare** Workers Builds Build variables, per project (§3.3) | admin build |
| `EXPO_PUBLIC_*` (binary) | `apps/mobile/eas.json` profile `env` (public, committed) | `eas build` |

No secret values are ever committed to the repo.

---

## 8. Live coordinates

| | URL / id |
|---|---|
| Cloudflare admin (staging) | `https://klt-cyber.luswataandrew190.workers.dev` |
| Cloudflare admin (production) | `https://klt-cyber-prod.luswataandrew190.workers.dev` |
| Convex staging deployment | `https://polite-lemming-570.convex.cloud` (site: `https://polite-lemming-570.convex.site`) |
| Convex staging dashboard | `https://dashboard.convex.dev/d/polite-lemming-570` |
| Convex production project | `klt-cyber-prod` — dev deployment `grandiose-falcon-452`, prod deployment `superb-dog-305`, both `eu-west-1` |
| Convex production deployment | `https://superb-dog-305.eu-west-1.convex.cloud` (site: `https://superb-dog-305.eu-west-1.convex.site`) |
| Convex production dashboard | `https://dashboard.convex.dev/t/luswata-andrew-16694/klt-cyber-prod/superb-dog-305` |
| GitHub Actions workflow (staging) | `.github/workflows/deploy-staging.yml` (trigger: push to `main`) |
| GitHub Actions workflow (production) | `.github/workflows/deploy-prod.yml` (trigger: push to `prod` — active since 2026-10-09, see §4.4) |
| EAS project | `6f0edc13-211f-441d-a389-8f8996676df4` (owner `landrian12`, slug `klt-cyber`) |

---

## 9. Hotfix process

**Staging:** push the fix to `main` — `mobile-update` ships an OTA to
`staging`; Cloudflare redeploys the web; Convex redeploys. Live in minutes for
a JS-only fix. A native fix needs a fresh `eas build`; OTA can't carry it.

**Production:** the `prod` branch and backend now exist (§1, §4.4), but there
is no fast-track process defined yet — today a hotfix means repeating the
manual steps in §4.4 by hand. Defining a real promotion/hotfix flow
(cherry-pick vs. full promotion, the binary-vs-OTA decision under load) is
still open; don't assume one exists.

---

## 10. Known gaps

Tracked against `docs/scope/scope.md` row 2 / spec
`docs/specs/_root/0001-production-readiness-safe-seeding.md` — this section is
the honest "not done yet" list, kept here so it doesn't quietly drop out of
sight once the rest of the document reads as finished.

- ~~Production R2 bucket/credentials~~ — **done 2026-10-08.** `klt-cyber-media-prod`
  exists, CORS applied, all five `R2_*` vars set on `superb-dog-305`, and
  proven with a real round trip (a temporary Convex action wrote an object
  through the production credentials, the signed URL it returned was fetched
  back over HTTPS with matching content, then both the object and the
  temporary function were removed). See `spec/STORAGE.md`.
- ~~No backup policy~~ — **done 2026-10-09, pending one secret.**
  `.github/workflows/backup.yml` exports both environments daily (plus
  `workflow_dispatch` for an on-demand backup before a risky change) to the
  `klt-cyber-backups` R2 bucket, 30-day retention. The restore procedure is
  proven, not just documented — see `spec/BACKUPS.md`. It can't actually run
  yet: it needs a `CLOUDFLARE_API_TOKEN` repo secret that doesn't exist, so
  every run will fail at the upload step until that's created.
- ~~`deploy-prod.yml` isn't active~~ — **done 2026-10-09**, PR #55. Both
  production deploy paths (Convex, mobile OTA) are now automatic on push to
  `prod`, same as staging. See §4.4.
- **Google OAuth isn't configured on production.** Optional — email/password
  sign-in works either way (`convex/auth.ts`).
- **No production mobile binary.** A production OTA has shipped (above), but
  no binary build has been run — `eas build --profile production` is still
  manual / deferred, same as staging's.
- **R2 object contents aren't backed up**, only their metadata (via the
  Convex export) — see `spec/BACKUPS.md`'s "What's still open".
- **`CLOUDFLARE_API_TOKEN` doesn't exist yet**, so `backup.yml` can't upload
  anywhere despite being live — see `spec/BACKUPS.md`.
