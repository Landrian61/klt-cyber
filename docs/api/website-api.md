# KLT Cyber website API — v1

For the church website's backend (Laravel). This is what KLT Cyber serves to the website: membership figures, the department list, and an endpoint to send approved announcements to members' phones. Spec: `docs/specs/_root/0026-website-api/index.md`.

Conventions follow the website's own `/api/v1`: an `X-Api-Key` header, keys per environment, closed when unconfigured, JSON always.

## Environments

Each environment is a separate deployment with its own address, keys and data. A key for one never works on another.

| Environment | Base URL | Data | Use it for |
|---|---|---|---|
| Development | `https://scrupulous-jaguar-678.convex.site` | Sample data | First integration, any experiment |
| Staging | `https://polite-lemming-570.convex.site` | Test data, real test phones | End to end testing before production |
| Production | `https://superb-dog-305.convex.site` | The church's real members | Live, once staging is signed off |

Every path below is relative to the base URL, for example `GET https://polite-lemming-570.convex.site/api/v1/figures`.

> A push sent to staging reaches the phones of the people testing the app. Use `dry_run` (below) until you mean to send one.

## Credentials

You receive two values per environment, sent separately from this guide and never by plain email or chat:

| Name | Where it goes | Used by |
|---|---|---|
| API key | `X-Api-Key` header | every request |
| Signing secret | HMAC key for `X-Klt-Signature` | `POST /api/v1/announcements` only |

Keep both in the website's `.env` (e.g. `KLT_CYBER_API_KEY`, `KLT_CYBER_SIGNING_SECRET`, `KLT_CYBER_BASE_URL`), never in git. If one leaks, tell us: we add a new key, you switch, we remove the old one. Several keys can be valid at once, so the switch has no downtime.

## Authentication

Every request:

```
X-Api-Key: <api key>
```

| Situation | Status | `error.code` |
|---|---|---|
| Key missing or unknown | 401 | `unauthorized` |
| This environment has no keys set yet | 503 | `not_configured` |

### Signed requests (POST only)

`POST /api/v1/announcements` also needs two headers:

```
X-Klt-Timestamp: <current Unix time in seconds>
X-Klt-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" using the signing secret>
```

- Sign the **exact bytes** you send as the body. Encode the JSON once, sign that string, send that string.
- The timestamp must be within **5 minutes** of our clock. Keep the server's clock synced (NTP).
- Sending the same announcement twice is safe (see *Idempotency*), so a retried job needs a fresh timestamp and signature and nothing else.

| Situation | Status | `error.code` |
|---|---|---|
| Signature wrong, missing or malformed | 401 | `bad_signature` |
| Timestamp missing or more than 5 minutes off | 401 | `stale_request` |
| Signing not set up on this environment | 503 | `not_configured` |

Laravel example:

```php
use Illuminate\Support\Facades\Http;

function kltCyberPost(string $path, array $payload)
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $timestamp = (string) time();
    $signature = 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $body, config('services.klt_cyber.signing_secret'));

    return Http::baseUrl(config('services.klt_cyber.base_url'))
        ->withHeaders([
            'X-Api-Key' => config('services.klt_cyber.api_key'),
            'X-Klt-Timestamp' => $timestamp,
            'X-Klt-Signature' => $signature,
        ])
        ->withBody($body, 'application/json')
        ->timeout(10)
        ->post($path);
}
```

Use `withBody`, not `->post($path, $payload)`: the latter re-encodes the array and the bytes sent would no longer match the signature.

## Endpoints

### `GET /api/v1/ping`

Checks your key and tells you which environment answered. Start here.

```json
{
  "data": {
    "ok": true,
    "deployment": "https://polite-lemming-570.convex.site",
    "time": "2026-11-19T09:00:00.000Z",
    "signing_configured": true
  }
}
```

### `GET /api/v1/departments`

The church's departments in display order.

```json
{
  "data": [
    {
      "id": "k17abc...",
      "name": "Media",
      "slug": "media",
      "description": "Sound, screens and Reign Radio",
      "order": 1,
      "paused": false
    }
  ]
}
```

- `id` is stable for the life of the department. Store it to join figures to departments.
- `slug` follows the name and is safe for URLs. Department names are fixed.
- `paused` departments exist but are not running yet. Show or hide them as the church decides.
- `description` may be `null`.

### `GET /api/v1/figures`

Membership counts. Never a name, contact or any other personal detail.

```json
{
  "data": {
    "as_of": "2026-11-19T08:45:00.000Z",
    "members": { "verified": 412 },
    "clans": [
      { "id": "k29def...", "name": "Judah", "verified": 58 }
    ],
    "departments": [
      { "id": "k17abc...", "name": "Media", "slug": "media", "serving": 24, "paused": false }
    ]
  }
}
```

- **verified**: people whose membership the church administration has verified, excluding deleted accounts.
- **clans[].verified**: verified members in that clan. Members not yet placed in a clan count in the total only, so the clans can add up to less than the total.
- **departments[].serving**: verified members on that department's roster, each person once.
- Every clan and department is listed, zeros included.
- Figures are recomputed every **15 minutes**; `as_of` says when. Cache on your side for up to 15 minutes. Calling more often returns the same numbers.
- Which figures appear on public pages is the church's decision.

### `POST /api/v1/announcements` (signed)

Sends an approved announcement to KLT Cyber. The first time it is published, every member gets a push notification and it appears in the app's Updates tab. Call it from the queued job that fans out an approved update.

**Publish or update**

```json
{
  "id": 1042,
  "status": "published",
  "title": "Harvest Sunday",
  "body": "Bring your harvest gift this Sunday. Service starts at 9:00.",
  "audience": "everyone",
  "priority": "high",
  "category": "event",
  "image_url": "https://kltchurch.org/storage/harvest.jpg",
  "links": [{ "label": "Details", "url": "https://kltchurch.org/events/harvest-sunday" }],
  "starts_at": "2026-11-20T00:00:00+03:00",
  "ends_at": "2026-11-23T21:00:00+03:00",
  "updated_at": "2026-11-19T08:12:45Z",
  "dry_run": false
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | Your announcement's id: a number, or text of letters, digits, `-`, `_` (≤ 64). Identifies it from now on. |
| `status` | no | `published` (default) or `withdrawn` |
| `title` | yes | ≤ 200 characters |
| `body` | yes | Plain text, ≤ 10,000 characters. The push shows the first 140. |
| `audience` | no | `everyone` (default). The only audience in this version, see below. |
| `priority` | no | `low`, `normal` (default) or `high`. High is pinned at the top in the app. |
| `category` | no | `general`, `event` or `program`. Any other value is left out and reported in `warnings`; the announcement is still delivered. |
| `image_url` | no | https URL, publicly readable. Shown as the cover. |
| `links` | no | Up to 10 `{ label, url }`, https only, label ≤ 100 |
| `starts_at` | no | ISO 8601 **with a zone** (`Z` or `+03:00`). Defaults to now. Shown in the app from then. |
| `ends_at` | no | ISO 8601 with a zone, not before `starts_at`. Defaults to 30 days after the start. Hidden from the feed after. |
| `updated_at` | strongly recommended | ISO 8601 with a zone: when this announcement was last changed on the website. A request older than the last one we applied is ignored (`result: "superseded"`), so a retried publish that lands after a withdrawal cannot bring it back. Send it on withdrawals too. |
| `dry_run` | no | `true` checks everything and reports the outcome, writing nothing and pushing nothing |

Response:

```json
{
  "data": {
    "id": "1042",
    "announcement_id": "k57ghi...",
    "result": "created",
    "pushed": true,
    "dry_run": false
  },
  "warnings": []
}
```

- `result`: `created` the first time, `updated` after that, `withdrawn` for a withdrawal, or `superseded` when your `updated_at` is older than one we already applied (nothing changed; treat it as success).
- `pushed`: whether this call sent the push. Only the first publish ever does.
- The push goes out when it is received, even if `starts_at` is later.

**Withdraw**

```json
{ "id": 1042, "status": "withdrawn", "updated_at": "2026-11-21T14:00:00Z" }
```

Takes it out of the app at once. Publishing the same `id` again brings it back, without a second push. Withdrawing an id we never received answers 404.

**Idempotency and order.** Everything is keyed on your `id`. Sending the same announcement again, or retrying after a timeout, updates the same announcement and never sends a second push. Retry freely on a 5xx or timeout. Send `updated_at` so retries that arrive out of order can't overwrite a newer change. Without it, the request that arrives last wins. An edit is the same call with the new content; any optional field you leave out is cleared.

**Audiences.** Only `everyone` is delivered now. Ministry-only and graduate-only announcements answer 422: `unsupported_audience` when the audience is the only problem, otherwise `validation_failed` with the audience listed among the other `details`. Don't send them until we agree how your ministries and graduates map to KLT Cyber's departments and Institute levels.

**Editing.** The KLT Cyber portal shows these announcements but can't edit them. Changes are made on the website and sent again.

## Errors

Every error is JSON:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The announcement has fields that need fixing.",
    "details": [
      { "field": "title", "message": "Required, as non-empty text." },
      { "field": "ends_at", "message": "Must be on or after starts_at." }
    ]
  }
}
```

| Status | `code` | Meaning | Retry? |
|---|---|---|---|
| 400 | `invalid_json` | Body is not JSON | No, fix it |
| 401 | `unauthorized` | Key missing or unknown | No |
| 401 | `bad_signature`, `stale_request` | See *Signed requests* | Yes, re-sign with a fresh timestamp. If it keeps failing, check the secret and the clock. |
| 404 | `not_found` | Unknown path or method, or withdrawing an unknown id | No |
| 413 | `payload_too_large` | Body over 64 KB | No |
| 422 | `validation_failed` | All field errors are in `details` | No, fix it |
| 422 | `unsupported_audience` | Audience not delivered yet | No |
| 500 | `internal_error` | Our fault | Yes, with backoff |
| 503 | `not_configured` | Environment not set up yet | Tell us |

## Testing it

Against **development** first, then **staging**. Set these in a shell:

```bash
BASE=https://polite-lemming-570.convex.site
KEY='<api key>'
SECRET='<signing secret>'
```

**1. Key and environment**

```bash
curl -s "$BASE/api/v1/ping" -H "X-Api-Key: $KEY"
# expect "ok": true, the deployment you meant, "signing_configured": true
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/ping" -H "X-Api-Key: wrong"
# expect 401
```

**2. Departments and figures**

```bash
curl -s "$BASE/api/v1/departments" -H "X-Api-Key: $KEY"
curl -s "$BASE/api/v1/figures" -H "X-Api-Key: $KEY"
```

Check that every `departments[].id` in figures appears in the department list.

**3. A signed dry run** (writes nothing, pushes nothing)

```bash
sign_and_post () {
  BODY="$1"
  TS=$(date +%s)
  SIG="sha256=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')"
  curl -s "$BASE/api/v1/announcements" \
    -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
    -H "X-Klt-Timestamp: $TS" -H "X-Klt-Signature: $SIG" \
    --data-binary "$BODY"
  echo
}

sign_and_post '{"id":"test-1","title":"Test from the website","body":"Dry run, nothing is sent.","dry_run":true}'
# expect "result":"created", "pushed":true, "dry_run":true
```

**4. Failure cases you should handle**

```bash
sign_and_post '{"id":"test-1","title":""}'                                   # 422, two details
sign_and_post '{"id":"test-1","title":"T","body":"B","audience":"ministry"}' # 422 unsupported_audience
SECRET=wrong sign_and_post '{"id":"test-1","title":"T","body":"B"}'          # 401 bad_signature
```

**5. A real send (staging only, after telling the app team)**

```bash
sign_and_post '{"id":"test-2","title":"Website test","body":"Please ignore: testing the website link."}'
# expect "created", "pushed": true. Test phones get a notification.
sign_and_post '{"id":"test-2","title":"Website test (edited)","body":"Please ignore: testing the website link."}'
# expect "updated", "pushed": false. No second notification.
sign_and_post '{"id":"test-2","status":"withdrawn"}'
# expect "withdrawn". It leaves the app's Updates tab.
```

**6. From Laravel**, repeat step 3 through the `kltCyberPost` helper above with `dry_run: true`. Then send one real announcement through the approval flow on staging and confirm with the app team that it arrived once.

Done when: every step answers as described on staging, a retried job produces no second push, and the website's figures cache refreshes no more often than every 15 minutes.

## Versioning

Anything that would break your integration goes under `/api/v2`. New optional fields and new endpoints may be added to v1 at any time, so ignore fields you don't recognise.
