# 0022. Member directory: decision record

## Context

`apps/mobile/app/members.tsx` is a placeholder: five hard coded people, filter pills for roles and mentorship that the SRS never allows in the directory, and a search over the fake names only. Spec 0014 already gives every profile a `directorySharing` choice (from the wizard's last step, My Profile, and portal Settings), but nothing reads it. So today a member's choice protects nothing and unlocks nothing.

The SRS rules are strict. Name, photo, clan and Areas of Service are for every verified member. Contact and work details pass only between two sharers. Sharing is off by default, and this has to be enforced on the server (NF-02), because a field the client merely hides still travels over the wire. The Uganda Data Protection and Privacy Act makes sharing a consent decision, not a preference.

Forces: about 50 members at launch on 29 November 2026, growing to the whole congregation. The profile has one free text `phone` field and no WhatsApp number. The mobile app gates only on `users.role`, never on `roleAssignments`. Two SRS phrases need interpreting: occupation is both searchable by all and visible only to sharers, and "leaders' access follows Section 3.5".

## Options considered

### Option 1: One field gated list query, filtered on the phone

The server returns every verified member's row with fields already gated, and the client searches and filters in memory. A second query returns one full card.

**Pros**: instant search, no index or migration, a single gating helper to test.
**Cons**: the payload and read count grow linearly, so it has a ceiling of a few thousand members.

### Option 2: Server search index with pagination

A denormalized search text field with a Convex search index, plus paginated, server filtered results.

**Pros**: scales to any size, and the payload stays bounded.
**Cons**: a new field kept in sync by every name and occupation writer, a backfill, and slower typing feedback. Occupation search would also need separate per viewer indexing to stay private.

### Option 3: Client side gating over a full profile query

Send full profiles and let the app hide fields.

**Pros**: the least server code.
**Cons**: it breaks NF-02 outright, since anyone can read the network response. Rejected on privacy grounds.

## Rationale

Option 1 fits the real scale. Launch is 50 people and the realistic horizon is hundreds to low thousands, well inside one query. Option 2's sync burden would touch the profile writers from specs 0014 and 0012 for a scale problem the church doesn't have yet. The Follow-up records a concrete trigger (2,000 verified members) for moving to it. Option 1 also makes the occupation privacy rule free: occupation is only in a row the viewer may see, so in memory matching can't leak it, while a shared search index would need per viewer care.

Engineer decisions folded in:
- Occupation search between sharers only.
- WhatsApp uses the same `phone`, normalized to `+256` at read time with no data migration.
- The mobile directory is pure share to see, so leaders keep using the portal.
- A pinned "You" preview.
- A detail screen, not a sheet.
- A consent sheet before turning sharing on, and an instant off.
- Navigation left to feature 12.
- The contact mark shown only to sharing viewers.
- Single choice filters that combine.
- First name sort.
- Phone buttons hidden when unusable.

Calls made at write time:
- The list carries no phone or email, so contact data leaves one card at a time (runner up: include it, which saves a round trip but bulk ships everyone's numbers).
- `getCard` returns one `null` for all four missing cases, so ids can't be probed (runner up: distinct errors, which help debugging but leak whether a person exists).
- Directory views aren't audit logged, because they are reads at high volume and the toggle is already logged (runner up: log each card view, which is heavy and has no stated need).
- Gating uses an allowlist copy, never a spread, so future profile fields default to private.
