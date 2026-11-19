# 0026. Website API: what KLT Cyber serves to the church website

**Date**: 2026-11-19
**Status**: In Progress

## Summary

The church website (Laravel, built by a separate developer) and KLT Cyber split ownership of church data: the website owns public content (programs, events, announcements, sermons, the radio address), KLT Cyber owns people (accounts, verification, clans, departments, rosters). This spec is KLT Cyber's half of the two connections the website calls: it reads membership **figures** (counts only) and the public **department list**, and it sends each **approved announcement** so KLT Cyber can push it to members' phones. It is served by Convex HTTP actions at `https://<deployment>.convex.site/api/v1/...`, one address per deployment, so dev, staging and production are separate with no code knowing which is which. The website developer's guide is `docs/api/website-api.md`.

Out of scope here, and owed to later specs: pulling the website's programs, events and Institute levels into Convex (the sync job), retiring the portal's program and event authoring, and the radio address. See *Follow-up*.

## Requirements

**User stories**:
- As the website, I show how many verified members the church has, by clan and by department, without ever holding a member's details.
- As the website, I list the church's departments with stable ids I can link figures to.
- As the website, when an announcement is approved I send it once and it reaches every member's phone once, even if my job retries.
- As the website developer, I can test each endpoint against staging without pushing to anyone's phone.

**Acceptance criteria**:

Gate
- **AC-1**: Routes, each at `/api/v1/` on the deployment's `.convex.site` address: `GET ping`, `GET departments`, `GET figures`, `POST announcements`. Any other path or method under `/api/v1/` answers a JSON 404.
- **AC-2**: Every route requires `X-Api-Key`, matched against `KLT_WEBSITE_API_KEYS` (comma separated, so a key is withdrawn by removing it). A missing or unknown key answers 401 `unauthorized`. Keys are compared by SHA-256 digest, every key checked.
- **AC-3**: Fails closed: with no keys set on a deployment, every route answers 503 `not_configured`. Unlike the website's own API, there is no open local mode, because every Convex deployment, dev included, is reachable from the internet.
- **AC-4**: `POST announcements` is also signed: `X-Klt-Timestamp` (Unix seconds) and `X-Klt-Signature` (`sha256=` + hex HMAC-SHA256 of `<timestamp>.<raw body>` under `KLT_WEBSITE_SIGNING_SECRET`). A timestamp more than 300 seconds from the server clock answers 401 `stale_request`; a wrong or malformed signature 401 `bad_signature`; no secret set, 503 `not_configured`. A body over 64 KB answers 413.
- **AC-5**: Each deployment holds its own keys and secret (`convex env set`). A key for staging never works on production.

Figures and departments
- **AC-6**: A **verified member** is a `memberProfiles` row with `profileStatus` `verified` whose user exists without `deletedAt`. It counts in its clan when `clanId` is set.
- **AC-7**: **Serving** in a department is a verified member with an `active` `departmentMemberships` row there, each person once. Pending claims, removed rows and unverified people never count.
- **AC-8**: `GET figures` returns `{ as_of, members: { verified }, clans: [{ id, name, verified }], departments: [{ id, name, slug, serving, paused }] }` from one stored snapshot (`websiteFigures`), recomputed every 15 minutes by cron and on the first request when none exists. Every clan and department is listed, including zeros. No user id, name, contact or profile field appears.
- **AC-9**: `GET departments` returns every department in `order`: `{ id, name, slug, description, order, paused }`, with `slug` from `slugifyDepartmentName` and `paused` from `PAUSED_DEPARTMENTS`. No HOD, no contact phone.

Announcements
- **AC-10**: A received announcement is an `announcements` row with `source: "website"` and `externalId` (the website's id), so the app shows it through the existing reads with no client change.
- **AC-11**: Keyed on `externalId`: a resend updates the same row and never adds a second one. Fields the website stops sending are cleared.
- **AC-12**: Payload: `id` (required), `status` (`published` default, or `withdrawn`), `title` (≤ 200) and `body` (≤ 10,000) required to publish, optional `priority` (`low|normal|high`), `category` (an unknown one is dropped and reported in `warnings`, not refused), `image_url` and `links[].url` (https only), `starts_at`/`ends_at` (ISO 8601 with a zone; defaults now and start + 30 days; end not before start), `audience` (only `everyone` in this version), `updated_at` (ISO 8601 with a zone, AC-18), `dry_run`. Every field error, an unsupported audience included, comes back at once in `details`: the code is `unsupported_audience` when that is the only error, else `validation_failed`.
- **AC-13**: The push (N21, whole church) goes out the first time the row is published and never again, through the existing `pushOnFirstPublish` gate, so a retry, an edit, or a withdraw then republish sends nothing more. The push carries no `createdBy`: `announcements.createdBy` and `notifications.createdBy` are widened to optional for this.
- **AC-14**: The portal refuses to edit, publish, disable or archive a website row ("change it in the website admin"), since the website would overwrite the change on its next send. The portal dialog shows such a row with a "From the website" badge, no Edit tab and no actions, only a line saying where it is changed.
- **AC-15**: `status: "withdrawn"` returns the row to `draft` (the existing "disabled" state), so it leaves the app at once and can come back. Withdrawing an id never received answers 404.
- **AC-16**: `dry_run: true` checks key, signature and payload and reports `result` and `pushed` as they would be, writing nothing and pushing nothing.
- **AC-17**: Every answer is JSON with `Cache-Control: no-store`; errors are `{ error: { code, message, details? } }`, success `{ data, warnings? }`.
- **AC-18**: Ordering: the row keeps the `updated_at` of the last request applied (`sourceUpdatedAt`). A publish or withdrawal whose `updated_at` is older answers 200 `result: "superseded"` and changes nothing, so a retried publish landing after a withdrawal cannot bring it back. Without `updated_at`, the latest arrival wins.

## Design decisions

- **HTTP actions, not a separate service.** Convex serves HTTP itself; the website needs four small routes. Nothing new to host, and the handlers call the same internal functions the app uses.
- **Per environment by deployment, not by code.** Each Convex deployment has its own `.convex.site` URL and env vars, so "endpoints per environment" falls out of configuration. No environment switch exists to get wrong.
- **Key plus signature on the POST.** The GETs reveal counts only, so a key is enough. The POST reaches every phone, so it also needs a signature over the body and a timestamp: a leaked key, or a captured request replayed later, cannot push.
- **Snapshot for figures.** The counts scan the member tables; a stored snapshot makes the website's request rate irrelevant to our cost and gives one honest `as_of`. Fifteen minutes is fresh enough for a public page.
- **No `activityLogs` row for website writes.** The log's actor is a KLT Cyber user and the website is not one. Spec 0007 made the same trade for emails with no user (`convex/emails.ts`). Widening `activityLogs.actorUserId` would touch every reader that resolves an actor (the audit log, department feeds, Hospitality, the Library, account deletion), for little gain. The row records the source, the website's id and edit time, and `notifications` records the push.
- **No system user.** The codebase already avoids one (`checkWeeklyProgramReminders`); `createdBy` is widened to optional instead, on the two tables that need it. Nothing reads either field for display.
- **Audience `everyone` only.** SRS A6-01 keeps announcements whole church only. The website also has ministry-only and graduate-only announcements; delivering those needs an agreed mapping (ministries to our departments, graduates to completed Institute levels) and an SRS change, so they are refused clearly rather than guessed.
- **No rate limit yet.** Every route is keyed, the GETs read one row or a small table, and the POST is idempotent. A rate limiter component can be added if a key leaks or traffic warrants it.

## SRS impact (written into `spec/SRS.md`)

- **A6-01** now names two publishers: Administration in the portal, and the website through this API, its rows read only in the portal. The 4.8.2 Announcements row says the same.
- **Section 7** (external services) lists the church website and how its credentials are held.
- Programs and events move to the website in a later spec (A4, A5).

## Follow-up

- Run `convex codegen` (it pushes to the dev deployment) so `internal.websiteApi` is typed.
- Generate keys and the signing secret per deployment; staging first. Production once its deployment exists.
- Portal: a "From the website" marker on the announcements list cards too, not only in the dialog.
- The content sync spec: pull programs, events, announcements and Institute levels from the website's `/api/v1`, keyed on stable ids with `updated_at` and deletions.
- Radio: confirm the website's `stream_url` plays from a phone on mobile data before replacing our listener pass (spec 0019).
- A signed `POST /api/v1/changed` ping to trigger that sync early, if the website developer agrees.
