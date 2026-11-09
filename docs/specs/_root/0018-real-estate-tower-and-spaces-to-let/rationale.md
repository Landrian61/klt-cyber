# 0018 rationale: Real Estate: Tower of Faith and spaces to let

The reasoning and the options behind [index.md](index.md). Read by humans, and by `/architect` on an update or a supersede. A build does not need this file.

## Context

> ⚠️ Premise note: the scope row reads "move facility management to Real Estate", which sounds like a permission change. It is not. Nothing in either app reads `facilities` today, so there is no user facing facility management to move: `convex/facilities.ts` is three mutations and a query that no screen calls, and the mobile More panel's `tower` entry does nothing when tapped. The real work here is building the Tower for the first time, on top of a table that happens to exist already. Treating it as a permission change would have produced a spec covering one of twelve requirements. The permission move is one task in a seven slice build, not the feature.

Kingdom Life Tabernacle's building, the Tower of Faith, is the church's most visible physical asset and the congregation has no way to find out what is in it. SRS 4.14 asks for two things from one department: the building described well enough for a member to find a facility, see its hours and reach it, and the spaces available to let listed well enough for someone to enquire. Twelve requirements span three surfaces (RE1-01 to RE1-06, RE2-01 to RE2-04, M7-01 to M7-03).

The forces that actually shaped the design:

**The authority model is already decided, and Real Estate was named in it.** Spec 0012 built a shared department portal on a dynamic `[slug]` route with three shell roles. Spec 0015 added the first department scoped capability, `manageLibrary`, and the comment it left in `convex/lib/authz.ts` says in so many words that Library is "the pattern Hospitality and Real Estate will land on". Designing a new authority mechanism here would be inventing a second way to do something the project settled two specs ago. The only genuine question was whether Real Estate's version needs the `roster` role too, and SRS 4.14.1 answers it: roster members have no portal access. Since Real Estate is not in `ROSTER_PORTAL_DEPARTMENTS`, that comes free.

**The table exists but was built for a different question.** `facilities` carries `campusBlock`, `address`, `contactEmail` and a single `imageUrl`, which is the shape of a campus directory, not of one building browsed floor by floor. It also has three rows seeded as hidden drafts in every deployment including production, so any new field has to be optional or the schema push breaks live data. A push to `main` deploys schema to staging automatically, so a non backward compatible change is not a local problem.

**The pieces this needs mostly already exist, and two specs ago someone planned for it.** `departments.contactPhone` was added in spec 0015 with a comment saying Real Estate's letting enquiries need the same field in the same week. The R2 upload gateway, `resolveMediaUrl`, the `tel:` and `wa.me` helper in the mobile Library screen, and `expo-image`, `expo-image-picker` and `expo-linking` are all installed. What does not exist is a multi image field anywhere in the schema and a gallery upload in the portal, so photos are the one genuinely new mechanism.

**The domain is small and fixed.** One building, a handful of floors, a handful of facilities per floor, a handful of vacant spaces, about fifty users at launch. Nothing here needs to scale, and designing as though it might would add structure nobody maintains.

**Opening hours are the one piece of real logic.** "Open now" or "Closed" has to be true about the building, not about the viewer, and Convex's reactivity works against the obvious approach: a query result caches on its arguments, so a server computed flag would not flip when the clock passed closing time unless the client kept re asking with a fresh timestamp.

## Options considered

### Option 1: free text placement, no floors table

Keep the existing `campusBlock` string as the floor label and add the hours, photos and contact fields to `facilities`. Spaces to let get their own table with typed building and floor strings. No new reference table.

**Pros**:
- Smallest schema change by a wide margin: one new table instead of two, and no foreign key to backfill.
- No floor management UI at all, so the portal is two simple list pages.

**Cons**:
- RE1-01 ("manage floors with name and order") cannot be satisfied. There is no order to set and renaming a floor means editing every facility on it.
- M7-01's "floor by floor" becomes grouping by string equality, so one typo splits a floor in two in the member app and nothing surfaces the mistake.
- The app and the portal can disagree about how many floors exist.

### Option 2: three tables on the shared portal shell, behind a department scoped capability

A `realEstateFloors` reference table that both facilities and spaces point at, the existing `facilities` table grown with floor, order, photos, WhatsApp, hours, responsible member and a soft remove stamp, and a new `realEstateSpaces` table. Two pages on the existing `[slug]` shell behind a new `manageRealEstate` capability scoped to the one department. Everything the member sees is derived at read time.

**Pros**:
- Satisfies all twelve requirements without inventing a mechanism, because the authority model, the upload gateway, the contact field and the one tap link pattern are all already in place.
- A floor is a real row, so order, rename and hide are one edit each and "browse floor by floor" is a grouped read rather than string matching.
- The second user of the department scoped capability is what turns spec 0015's one off into a pattern, and Hospitality is next.
- The visibility gate is five conditions evaluated on read rather than a stored flag, so it cannot go stale and a facility cannot be published in a state that dials nothing.

**Cons**:
- `facilities` acquires six optional fields, two of which (`floorId`, `photos`) are optional only because of the seeded drafts, so every reader handles absence the type system could otherwise have guaranteed away.
- Four now dead fields stay in the schema, because retiring them is not safely sequenceable in this pipeline (see *What the cross check changed* below), so `facilities` reads as eighteen fields of which four are noise.
- Twenty odd new Convex functions and three tables is a lot of surface for one week.

### Option 3: a buildings table above floors

Option 2 plus a `realEstateBuildings` table, because RE2-01 asks a space to carry "building and floor".

**Pros**:
- Honest about RE2-01's wording, and ready the day the church lets space in a second property.
- Grouping in both apps gains a level that is genuinely meaningful if more than one building exists.

**Cons**:
- The church has one building. The member app would render a one entry building level above every floor list, which reads as a bug rather than as structure.
- Two levels of reference table to maintain and two pickers in every form, for a case nobody has.
- Adding it later, when a second building actually arrives, is a smaller change than carrying it unused for a year, because by then the real requirements would be known.

### Option 4: one page, facilities and spaces in one table

Model a facility and a space as the same thing with a kind field, since both sit on a floor and carry photos and a contact.

**Pros**:
- One table, one form, one set of mutations: about half the code of Option 2.
- The photo and contact handling is written once rather than twice.

**Cons**:
- They are not the same thing. A facility has opening hours and services and is permanent; a space has a price, a size and a three state letting lifecycle and is temporary. Nearly every field would be conditional on the kind.
- SRS 4.14.2 names two pages and the SRS is the source of truth for product behaviour.
- The member surfaces differ too, so the saving is only in the writing, not in the reading.

## Rationale

Option 2, because every force in Context points at it and the only real cost is schema churn on a table nothing yet reads.

The decisive force is that the authority model was settled by specs 0012 and 0015 and explicitly anticipated this department. Any option that did not host Real Estate on the shared `[slug]` shell behind a scoped capability would be a second mechanism for a problem already solved, and the project would then have two ways to grant a department operational access with no rule for which to use. That Real Estate happens to need the narrower version (HOD and delegates only, no roster) costs nothing: leaving it out of `ROSTER_PORTAL_DEPARTMENTS` means `resolveDepartmentShellRole` already returns null for a roster member, so SRS 4.14.1 is enforced by an absence rather than by a new rule.

Option 1 was rejected on RE1-01 alone. "Manage floors with name and order" is not satisfiable by a string on each facility, and the failure mode is bad in exactly the place that matters: a typo quietly splits a floor in the member app with nothing to notice it. The floors table is one small reference table of the same shape as `clans` and `libraryCategories`, which this project already maintains two of, so it is a known cost.

Option 3 is the tempting one, because RE2-01 does say "building and floor" and a buildings table is the textbook reading. It was rejected because the church has one building and a one entry level in a hierarchy reads as a defect to the member looking at it. The requirement's wording describes the general case; the product has the specific one. Adding the level when a second property exists is a cheaper change than carrying an unused table, and the real requirements will be clearer then. This is the one place the spec deliberately builds less than the SRS's wording suggests, and it is recorded here rather than resolved silently.

Option 4 was rejected because the two things only look alike. Hours, services and permanence on one side; price, size and a letting lifecycle on the other. A shared table would make nearly every field conditional, and it contradicts SRS 4.14.2's two pages, which is product behaviour and therefore not ours to change.

Three choices inside Option 2 are worth recording, because each had a defensible alternative:

**Contact numbers are stored on the facility, never read live from the responsible member's profile.** Reading live is more current and less typing, and it was rejected anyway: a facility's public number is usually a desk line, publishing a member's personal mobile to the whole congregation is a real privacy decision rather than a convenience, and a member editing their own profile should not silently change what the congregation dials. The responsible member link is for the name only.

**"Open now" is computed on the client, against a fixed Kampala clock.** Convex caches a query result on its arguments, so a server computed flag would be correct when first read and then wrong for the rest of the day. One shared pure function in `packages/shared`, read by both surfaces, is the only version that cannot drift between them. The fixed UTC+3 offset rather than the device timezone follows from what the question means: the member is asking whether the building is open, not whether it would be open where they are standing. Uganda has never observed daylight saving, so the offset is exact and needs no timezone library, which matters because the mobile app has none installed and this feature is otherwise shipping over the air.

**Soft remove, not a hard delete.** The general advice is that soft deletes pollute queries and create ghost data, and it is good advice. It is overridden here by the project's own convention: spec 0015 established `deletedAt` for library items so that `activityLogs` references still resolve, and account deletion anonymises a `users` row rather than removing it for the same reason. The R2 objects are genuinely deleted either way, so the ghost is a row with a name and a timestamp, which is the point of an audit trail.

## What the cross check changed

An independent model read the first draft of this spec. Two of its findings changed the design rather than filling a blank, and both are worth recording so nobody reopens them.

**The four old fields are no longer retired by this feature.** The first draft planned two schema pushes with the backfill between them: add the new optional fields, copy `imageUrl` into `photos[0]`, then drop `campusBlock`, `address`, `contactEmail` and `imageUrl`. That sequence cannot be run by this project's pipeline. A push to `main` deploys the whole repository's schema to staging automatically (root `AGENTS.md`), so a single pull request carrying both pushes has no moment at which the backfill runs in between: it would either fail schema validation against live rows or drop a column whose data had not moved. Splitting it into two pull requests would work, but it makes a two part deploy a prerequisite of a feature that otherwise has none, and it means a rollback of this feature could take data with it. Leaving the fields in place, deprecated and written by nothing, costs a little tidiness and removes a whole class of deploy failure. The drop is now a Follow-up item and a later trivial pull request of its own, once the backfill is verified in all three environments.

**The open check must read two days, not one.** The first draft said the helper handles a window that crosses midnight and that the tests cover "both sides of it". That is not specific enough to build from, and the failure it hides is nasty: an implementation that reads only today's entry passes a test checking 23:30 on the evening the window opens, and is then wrong at 01:00 every following morning. A facility open Sunday 22:00 to 02:00 is open at 01:00 on Monday, and the only way to know that is to read **Sunday's** entry while the clock says Monday. The acceptance criterion and the verify steps now name that case specifically, including the Monday-closed variant that makes it unambiguous.

The rest of what it found were undecided values rather than wrong decisions: the weekday numbering, what a facility with no hours displays, whether the list cap applies before or after the visibility filter, whether the contact fallback is per field, how an edit clears a field, the photo content type allowlist, the activity log action names, and a dozen more. Each is now settled in the acceptance criteria. The pattern in all of them is the same: a value the criteria required that no input, column or earlier decision supplied. Three findings were set aside deliberately. Abandoned R2 uploads are a property of the shared gateway that spec 0015 has equally, so that is a Follow-up rather than this feature's problem. Tab state, scroll restoration, on screen number formatting and the dashboard cards' tap targets are build detail, not decisions. The floor delete versus concurrent create race is handled by Convex's own optimistic concurrency.

## Supporting evidence: what already exists

Read from the repository on 2026-11-07, before any of this was designed.

| Thing | State today | Consequence for this spec |
|---|---|---|
| `facilities` table | live, 14 fields, `by_active` index, 3 seeded hidden drafts | every new field must be optional; four fields go dead but stay in the schema |
| `convex/facilities.ts` | 111 lines: `listActiveFacilities`, `createFacility`, `updateFacility`, `archiveFacility`, all on `canManageChurchAdmin` | two mutations are repointed, two functions are replaced; no caller to migrate |
| `DEPARTMENT_SCOPED_CAPABILITIES` | one entry, `manageLibrary`, with a comment naming Real Estate as next | the pattern is reused as written, second entry added |
| `ROSTER_PORTAL_DEPARTMENTS` | Media, Hospitality, Library & Information | Real Estate stays out, which enforces SRS 4.14.1 by itself |
| `departments.contactPhone` | exists, E.164, added by spec 0015 with a comment citing RE2-04 | the space contact fallback needs no new field |
| `apps/admin/components/ui/ImageUpload.tsx` | single image, R2 round trip, handles legacy absolute URLs | the gallery component is built on its round trip, not from scratch |
| multi image fields in `convex/schema.ts` | none anywhere | `photos` sets the pattern; the cap matters |
| `apps/mobile/components/navigation/more-panel.tsx` | `tower` entry present, no `route` | the entry is wired, not added |
| `apps/mobile/app/library-item.tsx` | working `tel:` and `wa.me` contact buttons | the one tap pattern is reused |
| mobile dependencies | `expo-image`, `expo-image-picker`, `expo-linking`, Reanimated installed; no date library | nothing native is added, so this ships over the air; the hours helper uses plain arithmetic |
| `convex/seed.ts` `FACILITY_DRAFT_NAMES` | 3 names, none matching SRS 4.14.3's 7 | flagged as a disagreement, resolved for the SRS, recorded in Follow-up |

## Related specs

- [0012](../0012-shared-department-shell/index.md): the shared department portal shell, its `[slug]` route and its three shell roles. Real Estate's two pages are hosted on it unchanged.
- [0015](../0015-library-catalogue-free-content-stock/index.md): the first department scoped capability, the dashboard extras slot, `departments.contactPhone`, `E164_PHONE_REGEX` and `formatUgx`. This spec is the second user of all five.
- [0016](../0016-library-pdf-preview-and-page-one-covers/index.md): the R2 signed URL and content disposition findings. Relevant background for why photo URLs are signed per read rather than stored.
