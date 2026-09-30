# Storage — Cloudflare R2

The platform stores all uploaded files (profile photos, mentorship/leadership
proof certificates, Church Admin facility images, and any future media) in
**Cloudflare R2** object storage, accessed through the
[`@convex-dev/r2`](https://www.npmjs.com/package/@convex-dev/r2) Convex
component.

R2 is S3-compatible object storage with **no egress fees** — the right fit for
serving images and media that the mobile app and admin web app read frequently.

---

## Architecture

Storage is exposed as **one shared, auth-gated gateway** — `convex/uploads.ts` —
rather than each feature talking to R2 on its own. Credentials live only on the
Convex deployment (never in a client bundle), and the client never holds an R2
key or secret.

```
┌────────────┐  1. generateUploadUrl()      ┌─────────────────┐
│  client    │ ───────────────────────────▶ │  Convex         │
│ (mobile /  │ ◀─────────────────────────── │  convex/        │
│  admin web)│      { key, signed url }      │  uploads.ts     │
│            │                               │  (@convex-dev/  │
│            │  2. PUT bytes ───────────────────────────────▶ │   r2 component) │
│            │      (direct to R2)           └────────┬────────┘
│            │  3. syncMetadata({ key })              │  S3 API (R2 creds)
│            │ ───────────────────────────▶           ▼
│            │  4. getFileUrl(key) ─────────▶   ┌──────────────┐
│            │ ◀─── short-lived signed URL       │ Cloudflare R2│
└────────────┘                                   │   bucket     │
                                                 └──────────────┘
```

**Why we store the key, not a URL.** Signed URLs expire. The durable value saved
on a document (e.g. `memberProfiles.photoUrl`, `facilities.imageUrl`) is the
object **key**; it's resolved to a fresh short-lived URL at display time via
`getFileUrl` / `getMetadata`.

---

## One-time provisioning (Cloudflare dashboard)

You need a Cloudflare account with R2 enabled (a payment method on file — R2 has
a generous free tier and no egress fees).

### 1. Create the bucket

R2 → **Create bucket**. Use a per-environment name, e.g. `klt-cyber-media-dev`,
`klt-cyber-media-staging`, `klt-cyber-media-prod`. (A location hint is optional.)

Or with Wrangler:

```bash
npx wrangler r2 bucket create klt-cyber-media-dev
```

### 2. Create a bucket-scoped API token

R2 → **Manage R2 API Tokens** → **Create API Token**:

- Name it (e.g. `klt-cyber-media-dev-rw`).
- Permission: **Object Read & Write**.
- Under **Specify bucket**, select the bucket from step 1.
- **Create API Token**, then copy the four values it shows once:

  | Cloudflare field   | Maps to env var        |
  | ------------------ | ---------------------- |
  | Token value        | `R2_TOKEN`             |
  | Access Key ID      | `R2_ACCESS_KEY_ID`     |
  | Secret Access Key  | `R2_SECRET_ACCESS_KEY` |
  | Endpoint (S3 API)  | `R2_ENDPOINT`          |

  The endpoint looks like `https://<account_id>.r2.cloudflarestorage.com`.

### 3. Add a CORS policy

Browser uploads/reads (the admin web app) are subject to CORS; native mobile
uploads are not, but a policy is still required for web display. Apply
[`infra/r2-cors.json`](../infra/r2-cors.json) after replacing
`REPLACE_WITH_ADMIN_DOMAIN` with the deployed admin origin:

```bash
npx wrangler r2 bucket cors set klt-cyber-media-dev --file infra/r2-cors.json
```

Or paste it in the dashboard: R2 → your bucket → **Settings** → **CORS Policy** →
**Add CORS policy**.

---

## Configure the Convex deployment

The component reads its config from **Convex deployment environment variables**
(not from any `.env.local`). Set all five on each deployment:

```bash
# Dev deployment (the one `npx convex dev` is connected to)
npx convex env set R2_BUCKET            klt-cyber-media-dev
npx convex env set R2_ENDPOINT          https://<account_id>.r2.cloudflarestorage.com
npx convex env set R2_ACCESS_KEY_ID     <access-key-id>
npx convex env set R2_SECRET_ACCESS_KEY <secret-access-key>
npx convex env set R2_TOKEN             <token-value>

# Production deployment — same keys, prod bucket/credentials
npx convex env set --prod R2_BUCKET            klt-cyber-media-prod
npx convex env set --prod R2_ENDPOINT          https://<account_id>.r2.cloudflarestorage.com
npx convex env set --prod R2_ACCESS_KEY_ID     <prod-access-key-id>
npx convex env set --prod R2_SECRET_ACCESS_KEY <prod-secret-access-key>
npx convex env set --prod R2_TOKEN             <prod-token-value>
```

Verify with `npx convex env list`. These are secrets — never commit them.

> **CI/CD note:** the staging/production Convex deploys (see
> [`DEPLOYMENT.md`](./DEPLOYMENT.md)) must have these five variables present on
> the target Convex deployment for uploads to work.

---

## Using storage in a feature

The gateway (`convex/uploads.ts`) exports, all authorization-gated:

| Export              | Kind     | Who may call                    |
| ------------------- | -------- | ------------------------------- |
| `generateUploadUrl` | mutation | any authenticated user          |
| `syncMetadata`      | mutation | any authenticated user          |
| `getFileUrl`        | query    | any authenticated user          |
| `getMetadata`       | query    | any authenticated user          |
| `listMetadata`      | query    | Church Admin only               |
| `deleteObject`      | mutation | Church Admin only               |

### Backend (Convex)

Store the returned **key** on your document; resolve it when reading:

```ts
// In a query that returns a document for display:
const url = doc.photoUrl ? await ctx.runQuery(api.uploads.getFileUrl, { key: doc.photoUrl }) : null;
```

### Mobile (React Native / Expo)

Use the existing hook — `apps/mobile/lib/r2-upload.ts`:

```ts
const upload = useR2Upload();
const key = await upload(localUri, 'image/jpeg'); // → store `key` on the profile
```

### Admin web (Next.js)

Use the component's React hook, pointed at these functions:

```ts
import { useUploadFile } from '@convex-dev/r2/react';
import { api } from '@/lib/api';

const uploadFile = useUploadFile(api.uploads);
const key = await uploadFile(file); // browser File → object key
```

---

## Direct edge access (optional)

The admin Worker normally reaches storage through the Convex gateway above, so
**no Worker binding is needed**. Add an `r2_buckets` binding in
[`apps/admin/wrangler.jsonc`](../apps/admin/wrangler.jsonc) (a commented template
is there) **only** if the Worker itself must read/write objects at the edge — for
example streaming large media without a round trip through Convex. The bucket
must already exist or `wrangler deploy` fails.

---

## Conventions & notes

- **One bucket per environment.** Keep dev/staging/prod objects isolated with
  separate buckets and separate scoped tokens.
- **Objects are private by default.** Access is always via short-lived signed
  URLs from `getFileUrl` / `getMetadata`. Do not make the bucket public unless a
  feature explicitly needs unauthenticated public assets.
- **Deletion is admin-only.** `deleteObject` is gated to Church Admin. Client
  "remove photo" flows just drop the key reference on the document; reclaiming
  the orphaned object is an admin/cleanup concern.
- **Signed-URL lifetime** defaults to 15 minutes (`r2.getUrl`, max 7 days) — long
  enough to load, short enough to stay private.
