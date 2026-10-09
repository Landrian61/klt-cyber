# KLT Cyber — Backups

Implements F5-05 (`docs/scope/scope.md` row 2 / spec
`docs/specs/_root/0001-production-readiness-safe-seeding.md`): regular
restorable backups for both environments, and the ability to take one
on demand before a risky change.

---

## What's backed up, and what isn't

A full Convex snapshot export — every table, including component-owned ones
(`betterAuth`, `r2` metadata, `pushNotifications`) — captures the entire
application data layer. This project has **no Convex-native file storage**
(`ctx.storage` is never used — confirmed by grep, 2026-10-09); every uploaded
file goes through `@convex-dev/r2` instead (`spec/STORAGE.md`), so a Convex
export alone is a complete backup of the data layer.

**R2 object contents (photos, facility images, etc.) are not covered by this
backup system.** R2 itself has very high built-in durability as object
storage, and the `r2` component's *metadata* (which keys exist, what they're
attached to) *is* captured in the Convex export above — what isn't covered is
the object bytes themselves. If that ever needs backing up too (e.g. once
profile photos are actually in regular use), it's a separate piece of work:
either R2 bucket replication or a periodic `rclone`/S3-sync job.

---

## Where backups live

A dedicated bucket, separate from the media buckets: **`klt-cyber-backups`**,
with a 30-day expiry lifecycle rule (`expire-after-30-days`, applies to every
object — see `wrangler r2 bucket lifecycle list klt-cyber-backups`). Objects
are keyed `<environment>/<UTC timestamp>.zip`, e.g.
`production/2026-10-09T011629Z.zip`.

---

## Automation: `.github/workflows/backup.yml`

Two jobs, `backup-staging` and `backup-production`, each: `convex export` a
snapshot using that environment's existing deploy key
(`CONVEX_DEPLOY_KEY` / `CONVEX_DEPLOY_KEY_PROD` — the same secrets
`deploy-staging.yml` / `deploy-prod.yml` already use), then
`wrangler r2 object put` it into `klt-cyber-backups`.

Two triggers:
- **`schedule`** — `0 3 * * *` (03:00 UTC daily). No action needed; this is
  the "regular" half of F5-05.
- **`workflow_dispatch`** — run by hand, right before a risky change (a
  migration, a schema change, a bulk data operation). From the Actions tab's
  "Run workflow" button, or:
  ```sh
  gh workflow run backup.yml
  ```

### One secret this needs that nothing else in the repo does yet

`CLOUDFLARE_API_TOKEN` — a **general Cloudflare API token** (different from
the R2 S3-style credentials in `spec/STORAGE.md`; this one is what `wrangler`
itself authenticates with). Create it yourself, it's never relayed through
chat:

1. Cloudflare dashboard → your profile icon → **My Profile** → **API Tokens**
   → **Create Token** → **Custom Token**
2. Permission: **Account** → **Workers R2 Storage** → **Edit**
3. Account Resources: scope to the `klt-cyber` account only
4. Create, then set it as a GitHub secret yourself:
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN
   ```

Until that secret exists, `backup.yml` will fail at the upload step (the
export step works regardless — it only needs the Convex deploy keys, which
already exist).

---

## Restoring from a backup

**Proven, not just documented** — 2026-10-09, against a real production
export, restored into `klt-cyber-prod`'s otherwise-empty dev deployment
(`grandiose-falcon-452`), verified byte-for-byte (all 12 clans, 13
departments, 3 facilities, 5 weekly programs, the one `system_admin`
`roleAssignments` row, and the one `users` row all matched production
exactly), then wiped back to empty afterward.

```sh
# 1. Get a snapshot — either download one from the klt-cyber-backups bucket
#    (R2 dashboard, or `wrangler r2 object get`), or export fresh:
npx convex export --path snapshot.zip --deployment <source-deployment>

# 2. Restore it into the TARGET deployment. --replace-all overwrites
#    everything currently there — this is a real, destructive action on
#    whatever deployment you point it at. Omit -y to get a confirmation
#    prompt (recommended for anything other than a rehearsed drill):
npx convex import snapshot.zip --deployment <target-deployment> --replace-all
```

`--replace-all` is what makes this a true restore rather than a merge: it
deletes tables that aren't in the snapshot and clears tables that are in the
schema but empty in the snapshot, not just adds documents. That's also why
the confirmation prompt (when `-y` is omitted) matters — point this at the
wrong deployment and it's `--replace-all` there too.

**Never restore directly into a *different* live environment without
realizing it** — e.g. an accidental `--prod` instead of `--deployment
superb-dog-305` would target `klt-cyber`'s prod deployment (staging), not
`klt-cyber-prod`. Double-check `--deployment` against `spec/DEPLOYMENT.md` §8
before running this for real.

---

## What's still open

- **R2 object contents** aren't backed up (see above) — fine today since
  production has no real uploads yet, worth revisiting once it does.
- **No alerting on backup failure.** If `backup.yml` fails silently (e.g. the
  Convex deploy key rotates), nobody finds out until a restore is needed.
  GitHub does email the repo on a failed scheduled workflow by default, which
  covers this minimally — a dedicated alert is not set up.
- **No restore drill cadence.** The procedure above is proven to work once;
  "regularly rehearsed" is a further step this doesn't claim.
