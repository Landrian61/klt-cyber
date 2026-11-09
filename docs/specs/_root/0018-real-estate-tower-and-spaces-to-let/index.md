# 0018. Real Estate: Tower of Faith and spaces to let

**Date**: 2026-11-07
**Status**: In Progress

## Summary

Real Estate takes over the Tower of Faith. The department organises the building into floors, puts each facility on a floor with its photos, opening hours and a number the congregation can tap, and keeps a list of spaces available to let. Any signed in user browses the whole building floor by floor on their phone, sees whether a facility is open right now, and reaches either the facility or the letting desk in one tap.

Two things shape the design. Permission for facilities moves off Administration onto a department scoped capability (a permission granted by belonging to one named department rather than by holding a role everywhere), reusing exactly the pattern spec 0015 built for the Library. And unlike spec 0015, nothing native is added, so this whole feature reaches devices as an over the air update with no new installable build.

## Requirements

**User stories**:
- As Real Estate, I organise the Tower into floors and put each facility on one, so the congregation can browse the building the way they walk it.
- As Real Estate, I record a facility's photos, description, responsible person, numbers and opening hours, and keep it out of the app until it is complete enough to be useful.
- As Real Estate, I list a space to let with its size, photos and price, and mark it available, reserved or let as its situation changes.
- As Real Estate, I can see at a glance how many facilities are still unfinished, so nothing sits half done after my appointment.
- As a signed in user, I browse the Tower floor by floor, see each facility's photos and hours, and know whether it is open right now.
- As a signed in user, I call or WhatsApp a facility in one tap.
- As a signed in user, I browse the spaces available to let and reach Real Estate in one tap.

**Acceptance criteria** (the contract, each independently checkable):

Authority and the permission move (RE1-02's "permission moves to Real Estate", SRS 4.14.1)
- **AC-1**: `DEPARTMENT_CAPABILITIES` gains `manageRealEstate`, listed in `DEPARTMENT_SCOPED_CAPABILITIES` against `REAL_ESTATE_DEPARTMENT_NAME`. It is granted to `system_admin`, `hod` and `department_admin` of Real Estate, false for every other department, and false when `departmentCapabilities` is called without a department name. Real Estate is **not** added to `ROSTER_PORTAL_DEPARTMENTS`, so `resolveDepartmentShellRole` returns null for a Real Estate roster member and the capability can never reach one. `canEnterDepartment` is untouched.
- **AC-2**: `createFacility` and `updateFacility` stop calling `canManageChurchAdmin` and call `requireDepartmentCapability(ctx, "manageRealEstate")` instead. An Administration HOD or delegate holding no Real Estate role is refused. A System Admin keeps access. The `activityLogs` action names `facility.created` and `facility.updated` are unchanged, so rows already written stay readable. `archiveFacility` and `listActiveFacilities` are replaced (see AC-13 and AC-18); nothing in either app reads them today, so there is no caller to migrate.
- **AC-3**: two pages exist at `/areas-of-service/real-estate/tower` and `/areas-of-service/real-estate/spaces`, each gated on `manageRealEstate`. A caller without it gets a not found, not an empty page. The department sidebar renders the two entries only when `can.manageRealEstate` is true, so no other department shows them.
- **AC-4**: the shared Dashboard's extras slot (spec 0015, AC-28) renders three Real Estate cards: facilities listed (removed excluded, hidden included, since this is the team's own view), incomplete facilities, and spaces available. **Incomplete** means a facility that is not removed and is missing any one of: a contact number, a photo (an absent or empty `photos` array both count), opening hours, or a floor. The unplaced facilities of AC-27 therefore count as incomplete, which is the one reading that makes the card agree with the page. Each card renders an explicit empty state, and a failed query shows the shared `ErrorState` with a retry.

Floors (RE1-01)
- **AC-5**: an operator creates, renames, reorders and hides a floor. A new floor is appended at `max(order) + 1`; a reorder renumbers the ids it was given contiguously from zero and **appends any floor not in the list** in its previous relative order, so a floor created between the page load and the save is absorbed rather than rejecting the whole reorder. No two floors share an `order`. A name that is empty after trimming is refused with `REAL_ESTATE_FLOOR_NAME_REQUIRED`. A duplicate name is refused with `REAL_ESTATE_FLOOR_NAME_TAKEN`, on rename as well as on create, comparing trimmed values case insensitively with internal whitespace collapsed, so "First Floor" and "first  floor" collide.
- **AC-6**: deleting a floor that still has at least one facility or space whose `deletedAt` is unset is refused with `REAL_ESTATE_FLOOR_IN_USE`, and the refusal carries how many of each still use it so the message can name them. Hidden but not removed rows count toward those numbers, since they are still on the floor. An empty floor, including one whose last facility has since been removed, deletes outright. Hiding is always allowed.
- **AC-7**: a hidden floor leaves the member app taking everything on it, and leaves the floor picker for new rows. The portal keeps listing its facilities and spaces grouped under that floor marked "Hidden", so nothing is stranded or invisible to the team. Each portal row states **why** it is not in the app rather than sharing one label, because there are four distinct reasons and an operator fixing the wrong one is wasted work: "Hidden" (the row's own flag), "Floor hidden", "Not yet placed" (no floor) and "Needs a contact". A row visible in the app carries no label.

Facilities (RE1-02 to RE1-05)
- **AC-8**: an operator creates and edits a facility with name, tagline, description, services offered, floor, responsible person, phone, WhatsApp, opening hours and up to `RE_PHOTOS_MAX` photos. Every cap comes from `packages/shared` and is enforced again in the mutation. A facility created through the form starts `active: true`, since an operator filling the form is publishing; only the seed writes `active: false`. **Clearing a field follows spec 0015's AC-29 convention rather than inventing a second one**: an argument left `undefined` means "leave this alone", an empty string clears a string field, an empty array clears `photos` or `servicesOffered`, and `floorId` is cleared by the literal string `"none"` rather than by a null, because a Convex id validator will not accept one. Without this stated, "unpublish by clearing the floor" has no defined behaviour.
- **AC-9**: a facility's contact numbers are always stored on the facility itself, in strict E.164 form, validated by the shared `E164_PHONE_REGEX` that spec 0015 introduced. Choosing a member sets `responsibleUserId` and neither reads nor prefills that member's personal number. The two ways of naming a responsible person are mutually exclusive: setting `responsibleUserId` **clears** `contactPerson` and setting `contactPerson` clears `responsibleUserId`, so the normal path never refuses; only a single call that sets both at once is refused, with `REAL_ESTATE_RESPONSIBLE_AMBIGUOUS`. `responsibleUserId` may name any `users` row and is not restricted to verified members, because a facility can reasonably be run by someone who has not finished the profile wizard.
- **AC-10**: opening hours are seven entries, one per weekday, each either closed or an open and close pair stored as minutes from midnight. **Weekday `0` is Sunday, matching JavaScript's `getDay()`**, so no conversion sits between the stored data and the clock; both surfaces display the week starting Monday regardless. A close earlier than its open means the window runs into the next day, so a facility open 10:00 to 01:00 reads correctly. An open and close that are equal is refused with `REAL_ESTATE_HOURS_INVALID` as ambiguous (it reads as both zero length and all day); an all day facility is entered as 0 to 1439. An entry with a minute outside 0 to 1439, an open day missing either half of its pair, or a weekday that is duplicated or absent, is refused with the same code.
- **AC-11**: `photos` is an ordered array of at most `RE_PHOTOS_MAX` (6) R2 object keys, and `photos[0]` is the cover, so choosing a cover is a reorder and can never point at a photo that was removed. A duplicate key in one array is refused with `REAL_ESTATE_PHOTO_DUPLICATE`. Each upload's real size and content type are read back from R2 with `getMetadata(key)` and stored from what R2 reports, never from what the client claimed: over `RE_PHOTO_MAX_BYTES` (5 MB) is refused with `REAL_ESTATE_PHOTO_TOO_LARGE`, a content type outside `RE_PHOTO_CONTENT_TYPES` (`image/jpeg`, `image/png`, `image/webp`, deliberately **not** HEIC, which no browser renders) with `REAL_ESTATE_PHOTO_TYPE_UNSUPPORTED`, and a key R2 does not know with `REAL_ESTATE_PHOTO_MISSING`. On an edit, the keys scheduled for deletion are the old array minus the new one as a **set**, so a photo that only moved position is never deleted. The cleanup is scheduled inside the same mutation as the patch, so a mutation that later throws schedules nothing. A value that is an absolute URL rather than an R2 key (a backfilled `imageUrl`) is skipped by the delete path, which `toR2Key` in `convex/lib/media.ts` already decides.
- **AC-12**: a facility is reordered within its floor, and moved to another floor by an ordinary edit. A reorder renumbers the ids it was given contiguously from zero and appends any facility on that floor not in the list, by the same rule as AC-5, so a concurrent create is absorbed rather than rejecting the reorder. A facility created or moved onto a floor is appended at that floor's `max(order) + 1`, and the floor it left is renumbered contiguously in the same mutation so no gap is left behind.
- **AC-13**: hide sets `active: false`, so the facility leaves the app while the portal keeps listing it with its reason label from AC-7. Unhiding **always succeeds** and never checks completeness: visibility is derived on read by AC-18's five conditions and nothing else, so an operator can publish a half finished facility and simply see it is not live yet. Remove sets `deletedAt`, schedules `uploads.deleteReplacedObjects` for every photo key and clears `photos`, while the row stays readable so its activity log entries still resolve. A removed facility refuses every later mutation with `REAL_ESTATE_FACILITY_NOT_FOUND`, including a further hide, edit or reorder; a hidden facility still accepts all of them.
- **AC-14**: every floor, facility and space create, edit, reorder, status change, hide and remove writes an `activityLogs` entry carrying `departmentId` set to Real Estate, so the department's own feed and the audit trail both see it. The action names are `floor.created`, `floor.renamed`, `floor.reordered`, `floor.hidden`, `floor.deleted`, `facility.created`, `facility.updated`, `facility.reordered`, `facility.hidden`, `facility.removed`, `space.created`, `space.updated`, `space.status_changed` and `space.removed`. `facility.created` and `facility.updated` keep their existing names so rows already written stay readable. A status change carries the previous and the new status in `metadata`, because "it was let, now it is available" is the one transition anyone will later want to read back.

Spaces to let (RE2-01 to RE2-03)
- **AC-15**: an operator creates and edits a space with title, description, a required floor, size in square metres, an optional monthly price in whole shillings, up to `RE_PHOTOS_MAX` photos and an optional contact override. A price that is not a whole number or falls outside 0 to `RE_SPACE_PRICE_MAX_UGX` is refused with `REAL_ESTATE_PRICE_INVALID`, and a `sizeSqm` outside `RE_SPACE_SIZE_MIN_SQM` to `RE_SPACE_SIZE_MAX_SQM` with `REAL_ESTATE_SIZE_INVALID`. Photos follow AC-11 exactly.
- **AC-16**: a space's `status` moves freely among `available`, `reserved` and `let`, each change logged. A `let` space leaves the app and stays listed in the portal marked "Let", so it can be flipped back to available without retyping it. Remove sets `deletedAt` with the same photo cleanup and the same later mutation refusal as a facility, under `REAL_ESTATE_SPACE_NOT_FOUND`.

Member browse (RE1-06, RE2-04, M7-01 to M7-03)
- **AC-17**: any signed in user, visitor or member, opens the Tower screen from the More panel's existing `tower` entry, which routes instead of doing nothing, and gets two tabs, Facilities and Spaces to let. A caller with no session gets nothing back, per F3-08. Each tab renders a loading skeleton, a warm empty state naming what the tab will hold and that it is being prepared, and the shared error state with a retry.
- **AC-18**: the Facilities tab lists every facility where `active` is true, `deletedAt` is unset, `floorId` is set, that floor is not hidden, **and** at least one of `contactPhone` or `contactWhatsapp` is set. **Opening hours are not part of the gate**, so a facility with none still reaches the app and its card and detail screen read "Hours not listed", a third state beside "Open now" and "Closed", because labelling an unknown schedule "Closed" tells the member something false. The list is one scroll grouped by floor in floor `order` with a sticky floor header, and within a floor by facility `order` (absent sorts as zero) then name, so the order is stable when two facilities tie. A card shows the cover photo, name, tagline and the open status.
- **AC-19**: the facility detail screen shows the full photo gallery, description, services offered, the responsible person, the week's opening hours with closed days marked, and the open status. The responsible person is the `users` row's name when `responsibleUserId` is set, otherwise `contactPerson`; a named user whose row is anonymised or whose name is gone renders as "a former member" rather than blank, the same wording spec 0015's AC-25 uses for a deleted stock actor, since account deletion anonymises rather than removes. A WhatsApp button and a call button are built from the facility's own numbers: `tel:` uses the value exactly as stored and `wa.me` uses it with the leading `+` stripped, the same helper `library-item.tsx` already uses. A number that is not set renders no button rather than a button that dials nothing.
- **AC-20**: the Spaces to let tab lists every space where `deletedAt` is unset, `status` is not `let`, and its floor is not hidden, newest first by `createdAt` descending then `_id` descending, showing the cover photo, title, floor name, size, the price formatted as `USh 1,200,000` or "Price on enquiry" when absent, and a "Reserved" label where that applies. `by_status ["status", "createdAt"]` cannot express two statuses in one read, so the query reads the `available` and the `reserved` ranges separately and merges them by the stated sort rather than scanning the table.
- **AC-21**: the space detail screen shows the gallery, description, floor, size and price, and offers one tap WhatsApp and call on the effective number. The fallback is **per field, not all or nothing**: each of `contactPhone` and `contactWhatsapp` falls back independently to `departments.contactPhone` for Real Estate, so a listing overriding only its phone still offers WhatsApp. `departments` carries one number and no separate WhatsApp field, which is correct here because a Ugandan mobile number serves both. When a field has neither an override nor a fallback, that button does not render, and when neither does, the screen still shows everything else.
- **AC-22**: "Open now", "Closed" or "Hours not listed" is computed client side by one shared pure function, `isFacilityOpenNow(openingHours, nowMs)` in `packages/shared`, read by the mobile screen and the portal's operator preview alike. It resolves the weekday **and** the time of day against a fixed Africa/Kampala clock (UTC+3, no daylight saving), not the viewer's device timezone, because the question is whether the building is open. **It must test two entries, not one**: today's, and yesterday's when yesterday's window crosses midnight, because a facility open Sunday 22:00 to 02:00 is open at 01:00 on Monday and an implementation that reads only Monday's entry is wrong every such morning while still passing a naive test. Absent `openingHours` returns the third state, never "Closed". Unit tested for a normal window, a closed day, an overnight window checked at 23:30 and at 01:00 the next day and at 03:00, absent hours, and a viewer whose device is in another timezone. The mobile screen recomputes on screen focus and on a one minute interval while focused, so a label cannot sit stale through a closing time, and clears the interval on blur.
- **AC-23**: a list payload carries only `photos[0]`, resolved to a signed URL. The full gallery, and for a space the effective contact number, reach the client only through the detail query, so a surface that renders neither is sent neither. A deep link to a facility or space that is hidden, removed, unplaced, on a hidden floor or gone resolves to null rather than throwing, and the screen says it is no longer available. The id arrives as a string and is resolved with `normalizeId`, so a malformed id is also a null rather than a thrown argument validation error.

Shared contracts, seed, migration and tests
- **AC-24**: every union, cap, bound, error code, the `REAL_ESTATE_DEPARTMENT_NAME` constant and the hours helper live in `packages/shared/src/constants/realEstate.ts` with unit tests, reusing `E164_PHONE_REGEX` and `formatUgx` from spec 0015's `library.ts` rather than redefining either, so money and phone numbers read identically across the app. The caps are: facility name 120, tagline 160, description 2000, floor name 60, space title 160, space description 2000, at most 12 services offered each within 60, at most 6 photos, photo 5 MB, price 0 to 100,000,000 shillings, size 0.1 to 100,000 square metres. `REAL_ESTATE_DEPARTMENT_NAME` is exactly `"Real Estate"`, the string `seed.ts` writes, and a Convex test asserts it matches a real seeded `departments` row: a mismatch here is silent, because the scoped capability would simply read false for everyone except a System Admin and nobody would see an error.
- **AC-25**: **one** schema push adds `realEstateFloors` and `realEstateSpaces`, adds `floorId`, `order`, `photos`, `contactWhatsapp`, `responsibleUserId` and `deletedAt` to `facilities` as **optional** fields so live rows stay valid, and adds the `by_floor` index. `campusBlock`, `address`, `contactEmail` and `imageUrl` are **not dropped by this feature**: they stay in the schema as optional, marked deprecated in a comment naming this spec, written by nothing and read by nothing. A one off `convex/realEstateMigration.ts` copies each existing facility's `imageUrl` into `photos[0]` (skipping an empty or unparsable value, and leaving `imageUrl` in place rather than clearing it, so the migration is safe to re run and the old value stays as evidence), stamps an `order` from `_creationTime` ascending across all rows since none has a floor yet, and **reports without rewriting** any `contactPhone` that fails `E164_PHONE_REGEX`, so a value entered under the old loose rule is known about before an operator hits it on first edit. The migration is idempotent and reports how many rows it touched in each category. Dropping the four fields is deliberately a later spec: see Follow-up for why one push plus a backfill is the only sequence this project's deploy pipeline can actually run.
- **AC-26**: `seed.ts`'s `FACILITY_DRAFT_NAMES` becomes the seven names SRS 4.14.3 records (Heritage Academy, restaurant, saloon, conference halls, Leadership Institute, parking, offices), still inserted as hidden drafts with `active: false` and a name only, still idempotent by name, still safe to run in production. No floors are seeded, because only Real Estate knows the Tower's real floor names and order. The three names already seeded are left in place rather than renamed or deleted.
- **AC-27**: the portal's Tower page groups facilities whose `floorId` is unset under "Not yet placed", so a seeded draft is visibly unfinished rather than missing from the page entirely.
- **AC-28**: Convex tests cover the authority matrix (`manageRealEstate` true for Real Estate's HOD, delegate and a System Admin; false for every other department; false when no department name is passed; a Real Estate roster member resolves to no shell role at all; `REAL_ESTATE_DEPARTMENT_NAME` matches a seeded row), the floor in use refusal and the empty floor delete, the responsible person ambiguity refusal and the clear on set behaviour, the hours validation including the overnight window read from the previous day's entry, the photo cap, duplicate and type refusals, the photo diff on edit not deleting a photo that only moved, and the member visibility gate (a facility missing a contact, an unplaced facility, a facility on a hidden floor and a `let` space are each absent from the member queries).
- **AC-29**: every list query is bounded by an explicit `.take(REAL_ESTATE_LIST_CAP)` (200) so no read is unbounded, and no page control is rendered, because one building cannot plausibly reach that cap. **The cap is applied after the visibility filter, never before**: filtering a floor's hidden rows out of an already truncated page would drop visible facilities silently, which is the failure mode a cap is supposed to prevent rather than cause. A list that does reach the cap is a signal to revisit, recorded in Follow-up.

## Decision

**Chosen option**: Option 2: three tables on the shared portal shell, behind a department scoped capability.

Model the Tower as a floors table that both facilities and spaces to let reference, grow the existing `facilities` table rather than replacing it, add `realEstateSpaces` beside it, and host Real Estate's two pages on the existing dynamic `[slug]` shell behind a new `manageRealEstate` capability scoped to the one department, exactly as spec 0015 scoped `manageLibrary`.

**Implementation skills**: `convex` (`.claude/skills/convex/`) for the schema, function, scheduler and migration conventions · `convex-reviewer` (`.claude/skills/convex-reviewer/`) for the authz and validator review before the permission move ships · `shadcn` (`.claude/skills/shadcn/`) for the portal's primitives and the gallery upload component · `mobile-frontend-design` (`.claude/skills/mobile-frontend-design/`) for the Tower screen, the sticky floor headers, the gallery and the tab interactions

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`realEstateFloors` (new), the structure behind RE1-01 and M7-01's "floor by floor".

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | trimmed, within `RE_FLOOR_NAME_MAX_LENGTH`, unique case insensitively (enforced in the mutation, Convex has no unique indexes) |
| `order` | number | yes | renumbered contiguously from zero by a reorder, so no two tie |
| `hidden` | boolean | yes | retires a floor without stranding what sits on it |
| `createdBy` | `Id<"users">` | yes | |
| `createdAt`, `updatedAt` | number | yes | |

Index: `by_order ["order"]`

`facilities` (existing, grown), RE1-02 to RE1-05.

| Field | Type | Required | Change |
|---|---|---|---|
| `name` | string | yes | kept |
| `tagline`, `description` | string | no | kept |
| `servicesOffered` | string[] | no | kept, capped at 12 entries |
| `floorId` | `Id<"realEstateFloors">` | no | **new**, optional so a seeded draft stays valid; unset means "Not yet placed" and absent from the app |
| `order` | number | no | **new**, position within its floor; absent sorts as zero, ties break by name |
| `photos` | string[] | no | **new**, R2 keys, at most 6, `photos[0]` is the cover |
| `contactPhone` | string | no | kept, now strict E.164 on the shared regex |
| `contactWhatsapp` | string | no | **new**, E.164 |
| `responsibleUserId` | `Id<"users">` | no | **new**, mutually exclusive with `contactPerson` |
| `contactPerson` | string | no | kept, the typed name alternative |
| `openingHours` | 7 embedded entries | no | **new**, `{ weekday: 0 to 6, closed: boolean, openMinutes?: number, closeMinutes?: number }`, weekday 0 is Sunday (fixed size nested data embeds, per root `AGENTS.md`) |
| `active` | boolean | yes | kept, and this is the hide flag |
| `deletedAt` | number | no | **new**, soft remove |
| `createdBy`, `createdAt`, `updatedAt` | | yes | kept |
| `campusBlock`, `address`, `contactEmail` | string | no | **deprecated**, kept in the schema, written by nothing, read by nothing; dropped in a later spec (AC-25) |
| `imageUrl` | string | no | **deprecated**, backfilled into `photos[0]` and left in place |

Indexes: `by_active ["active"]` kept, `by_floor ["floorId", "order"]` added

`realEstateSpaces` (new), RE2-01 to RE2-04.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | within `RE_SPACE_TITLE_MAX_LENGTH` |
| `description` | string | no | within `RE_SPACE_DESCRIPTION_MAX_LENGTH` |
| `floorId` | `Id<"realEstateFloors">` | yes | one building, so a floor places a space fully |
| `sizeSqm` | number | no | `RE_SPACE_SIZE_MIN_SQM` to `RE_SPACE_SIZE_MAX_SQM` |
| `priceUgxPerMonth` | number | no | whole shillings; absent reads "Price on enquiry" |
| `photos` | string[] | no | at most 6, `photos[0]` is the cover |
| `contactPhone`, `contactWhatsapp` | string | no | per listing override; falls back to `departments.contactPhone` |
| `status` | `"available"` \| `"reserved"` \| `"let"` | yes | `let` leaves the app |
| `deletedAt` | number | no | soft remove |
| `createdBy`, `createdAt`, `updatedAt` | | yes | |

Indexes: `by_status ["status", "createdAt"]`, `by_floor ["floorId"]`

Relationships: `realEstateFloors` 1:N `facilities` (optional foreign key) · `realEstateFloors` 1:N `realEstateSpaces` (required) · `users` 1:N `facilities` through `responsibleUserId` and `createdBy` · the Real Estate `departments` row supplies the `contactPhone` fallback for every space. No table is unbounded: a floor holds a handful of rows and the whole domain is one building.

**State transitions**:

Facility: `active: false` (a seeded draft, or a row an operator hid) ⇄ `active: true` (created that way through the form, or unhidden), moved by `setFacilityHidden` alone, which never refuses on completeness → `removed` (`deletedAt` set) is terminal and refuses every later mutation.

Note that `active` is the **only** stored state. Whether a facility is actually *visible to a member* is not a state at all: it is AC-18's five conditions evaluated on read, of which `active` is one. The two were deliberately not folded together, because a state machine that refused to publish an incomplete facility would leave an operator unable to save work in progress.

Space: `available` ⇄ `reserved` ⇄ `let`, all six directions allowed and each logged, with only `available` and `reserved` reaching the app → `removed` (`deletedAt` set) is terminal.

Floor: `visible` ⇄ `hidden` by hide, and `deleted` only from empty (a hard delete, since a floor carries no content of its own).

**API surface**:

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `realEstate.listFloors` | query | none | floors with facility and space counts | `manageRealEstate` | refused when capability absent |
| `realEstate.createFloor` | mutation | `name: string` (req) | `floorId` | `manageRealEstate` | `REAL_ESTATE_FLOOR_NAME_TAKEN` |
| `realEstate.renameFloor` | mutation | `floorId` (req), `name: string` (req) | `ok` | `manageRealEstate` | `REAL_ESTATE_FLOOR_NAME_TAKEN`, not found |
| `realEstate.reorderFloors` | mutation | `orderedIds: Id[]` (req) | `ok` | `manageRealEstate` | set mismatch refused |
| `realEstate.setFloorHidden` | mutation | `floorId` (req), `hidden: boolean` (req) | `ok` | `manageRealEstate` | not found |
| `realEstate.deleteFloor` | mutation | `floorId` (req) | `ok` | `manageRealEstate` | `REAL_ESTATE_FLOOR_IN_USE` with both counts |
| `facilities.listForPortal` | query | none | facilities grouped by floor plus "Not yet placed", cover URL only | `manageRealEstate` | refused when capability absent |
| `facilities.createFacility` | mutation | `name` (req), `floorId`, `photos`, `openingHours`, `contactPhone`, `contactWhatsapp`, `responsibleUserId`, `contactPerson`, `tagline`, `description`, `servicesOffered` (all opt) | `facilityId` | `manageRealEstate` (was `canManageChurchAdmin`) | `REAL_ESTATE_HOURS_INVALID`, `REAL_ESTATE_RESPONSIBLE_AMBIGUOUS`, `REAL_ESTATE_PHOTO_TOO_LARGE`, `REAL_ESTATE_PHOTO_TYPE_UNSUPPORTED` |
| `facilities.updateFacility` | mutation | `facilityId` (req) plus any editable field (opt) | `ok` | `manageRealEstate` (was `canManageChurchAdmin`) | as create, plus `REAL_ESTATE_FACILITY_NOT_FOUND` |
| `facilities.reorderFacilities` | mutation | `floorId` (req), `orderedIds: Id[]` (req) | `ok` | `manageRealEstate` | set mismatch refused |
| `facilities.setFacilityHidden` | mutation | `facilityId` (req), `hidden: boolean` (req) | `ok` | `manageRealEstate` | `REAL_ESTATE_FACILITY_NOT_FOUND` (replaces `archiveFacility`) |
| `facilities.removeFacility` | mutation | `facilityId` (req) | `ok` | `manageRealEstate` | `REAL_ESTATE_FACILITY_NOT_FOUND` |
| `realEstate.listSpacesForPortal` | query | none | every space not removed, with status and cover URL | `manageRealEstate` | refused when capability absent |
| `realEstate.createSpace` | mutation | `title` (req), `floorId` (req), `description`, `sizeSqm`, `priceUgxPerMonth`, `photos`, `contactPhone`, `contactWhatsapp` (opt) | `spaceId` | `manageRealEstate` | `REAL_ESTATE_PRICE_INVALID`, `REAL_ESTATE_SIZE_INVALID`, photo errors |
| `realEstate.updateSpace` | mutation | `spaceId` (req) plus any editable field (opt) | `ok` | `manageRealEstate` | as create, plus `REAL_ESTATE_SPACE_NOT_FOUND` |
| `realEstate.setSpaceStatus` | mutation | `spaceId` (req), `status` (req) | `ok` | `manageRealEstate` | `REAL_ESTATE_SPACE_NOT_FOUND` |
| `realEstate.removeSpace` | mutation | `spaceId` (req) | `ok` | `manageRealEstate` | `REAL_ESTATE_SPACE_NOT_FOUND` |
| `realEstate.getDashboardCards` | query | none | `facilitiesListed`, `incompleteCount`, `spacesAvailable` | `manageRealEstate` | refused when capability absent |
| `facilities.listTowerFacilities` | query | none | visible facilities grouped by floor, cover URL and hours only | any signed in user | null with no session |
| `facilities.getFacility` | query | `facilityId: string` (req) | full detail with gallery, or **null** | any signed in user | null for hidden, removed, unplaced, hidden floor, malformed id |
| `realEstate.listSpacesToLet` | query | none | available and reserved spaces, cover URL only | any signed in user | null with no session |
| `realEstate.getSpace` | query | `spaceId: string` (req) | full detail with the effective contact, or **null** | any signed in user | null for `let`, removed, hidden floor, malformed id |
| `realEstateMigration.backfillFacilityPhotos` | internal mutation | none | rows touched | internal only | idempotent, safe to re run |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `listTowerFacilities` | cover image URL | `photos[0]` through `resolveMediaUrl` (`convex/lib/media.ts`); absent means the card renders its placeholder |
| `listTowerFacilities` | the floor name a group is headed by | `realEstateFloors.name`, joined on `floorId` |
| `listTowerFacilities` | group and row order | `realEstateFloors.order`, then `facilities.order` treating absent as zero, then `facilities.name` |
| mobile Facilities tab | "Open now", "Closed" or "Hours not listed" | **not produced server side.** `facilities.openingHours` is the data; the clock comes from the device and is normalised to UTC+3 by `isFacilityOpenNow` in `packages/shared` (AC-22). A Convex query result caches on its arguments, so a server computed flag would not flip as the clock passed closing time. Absent hours yield the third state, not "Closed" |
| mobile Facilities tab | the weekday the hours are read against | derived from the UTC+3 shifted timestamp inside `isFacilityOpenNow`, **not** the device's own weekday, so a viewer abroad near midnight still reads the building's day. Weekday 0 is Sunday, matching `getDay()` |
| mobile Facilities tab | whether an overnight window is currently open | **two** entries, not one: today's, and the previous day's when its `closeMinutes` is below its `openMinutes`. Without the second read, a Sunday 22:00 to 02:00 facility reads "Closed" at 01:00 on Monday |
| mobile Facilities tab | when the open status is recomputed | screen focus plus a one minute interval while focused (AC-22); nothing on the server drives it |
| `getFacility` | responsible person's display name | `users.name` joined on `responsibleUserId` when set, otherwise the `contactPerson` column; AC-9 guarantees only one is ever set. A row that is anonymised or has no name yields the literal "a former member", following spec 0015's AC-25 |
| `getFacility` | the `wa.me` link's digits | the stored E.164 `contactWhatsapp` with its leading `+` stripped, by the same helper `apps/mobile/app/library-item.tsx` already uses |
| `getFacility` | the full gallery's URLs | every `photos` key through `resolveMediaUrl`, signed only on this query, never on a list (AC-23) |
| `listSpacesToLet` | price text | `priceUgxPerMonth` through `formatUgx` (spec 0015's `library.ts`); absent yields the literal "Price on enquiry" |
| `getSpace` | the effective contact number | resolved **per field**: `realEstateSpaces.contactPhone` when set, else `departments.contactPhone`; and `realEstateSpaces.contactWhatsapp` when set, else the same `departments.contactPhone`, since `departments` holds one number and a Ugandan mobile serves both. The department row is the one whose `name` equals `REAL_ESTATE_DEPARTMENT_NAME`. Resolved server side so the two surfaces cannot disagree |
| every list and detail query | the Real Estate `departments` row | looked up by `REAL_ESTATE_DEPARTMENT_NAME`, which AC-24 pins to `"Real Estate"` and a test holds against the seed. A missing row (seed never run) yields no contact fallback and no capability for anyone but a System Admin, which is why the test exists rather than a runtime guess |
| `getDashboardCards` | facilities listed | count of `facilities` rows with `deletedAt` unset, hidden included |
| `getDashboardCards` | incomplete facilities | derived at read time from a row having no contact, no `photos` entry (absent or empty both count), no `openingHours`, **or no `floorId`**; never a stored flag, which would go stale. The floor condition is what makes this card agree with the "Not yet placed" group on the page |
| portal rows | the reason a row is not in the app | derived from the same five conditions, reported as the first that fails in the order hidden, floor hidden, no floor, no contact (AC-7), so an operator is pointed at one fix rather than a bare "Hidden" |
| `getDashboardCards` | spaces available | count of `realEstateSpaces` with `status` `available` and `deletedAt` unset |
| `createFacility` / `updateSpace` | a photo's stored size and content type | read back from R2 with `getMetadata(key)` at attach time, never from the client (AC-11) |
| every mutation | the `departmentId` on the activity log row | the Real Estate `departments` row looked up by `REAL_ESTATE_DEPARTMENT_NAME`, the same constant the capability is scoped by |

**Key invariants**:
- No two floors share an `order`; a reorder renumbers contiguously from zero in one transaction.
- A floor is deleted only when nothing that is not removed references it.
- A facility never carries both `responsibleUserId` and `contactPerson`; setting either clears the other.
- `photos` never exceeds `RE_PHOTOS_MAX`, holds no duplicate key, and `photos[0]` is always the cover, so no separate cover pointer can dangle.
- The keys deleted from R2 on an edit are exactly the set difference of old minus new, so a photo that only changed position is never deleted.
- Weekday `0` is Sunday everywhere: in the stored entries, in the shared helper, and in every test. There is no conversion layer to get wrong.
- A facility reaches the app only when all five hold: `active`, no `deletedAt`, a `floorId`, that floor not hidden, and at least one contact number.
- A space reaches the app only when `deletedAt` is unset, `status` is not `let`, and its floor is not hidden.
- A row with `deletedAt` set refuses every mutation, so a removed thing can never be edited back into existence with its photos already deleted from R2.
- Every stored phone number matches `E164_PHONE_REGEX`; there is one phone format in this project, not two.
- No list query is unbounded; each ends in `.take(REAL_ESTATE_LIST_CAP)`.

**Security model**:

Writes: `manageRealEstate`, scoped to the Real Estate department and held by its HOD, its delegates and a System Admin. Checked in every mutation through `requireDepartmentCapability`, which is the real boundary; the sidebar gating and the page level checks are UX. Real Estate stays out of `ROSTER_PORTAL_DEPARTMENTS`, so a roster member resolves to no shell role there and cannot hold the capability at all, which is how SRS 4.14.1's "roster members have no portal access" is satisfied without a second rule. Administration loses facility write access entirely, by design.

Reads: the four member queries are open to any signed in user, visitor or member, and return nothing without a session (F3-08). What they expose is deliberately public church information: a facility's published desk number, its photos and its hours. The only personal data involved is a responsible member's **display name**, shown because RE1-02 asks for it; their personal phone number is never read, which is why AC-9 stores contact numbers on the facility instead. The operator queries carry more (hidden rows, unplaced drafts, the dashboard counts) and are capability gated accordingly. Every consequential write lands in `activityLogs`. No regulated data and no compliance scope is triggered by this feature.

**Configuration required**: none. Photos use the R2 binding already registered in `convex/convex.config.ts`, and the contact number lives in the database, not an env var. No new secret, credential or third party account.

**Critical test scenarios**:
- Happy path: Real Estate's HOD creates a floor, puts a complete facility on it with hours and a WhatsApp number, and a signed in visitor sees it under that floor header reading "Open now" and taps through to a working WhatsApp link, verifies **AC-5**, **AC-8**, **AC-18**, **AC-19**, **AC-22**
- Happy path: an available space with a price shows `USh` formatted on the Spaces tab and offers the department's fallback number on its detail screen, verifies **AC-20**, **AC-21**
- Failure case: deleting a floor that still holds two facilities and one space is refused with both counts, and hiding it instead removes all three from the app while the portal still lists them under the hidden floor, verifies **AC-6**, **AC-7**
- Failure case: a facility open **Sunday** 22:00 to 02:00 reads "Open now" at 23:30 Sunday and at 01:00 **Monday**, and "Closed" at 03:00 Monday, including for a device set to a different timezone. The 01:00 Monday case is the one an implementation reading only today's entry fails, verifies **AC-22**
- Failure case: a facility with a contact but no opening hours appears in the app reading "Hours not listed", never "Closed", and is still counted as incomplete on the dashboard, verifies **AC-18**, **AC-4**
- Failure case: a facility saved with no contact number never appears in the app but is counted as incomplete on the dashboard, verifies **AC-18**, **AC-4**
- Failure case: an edit that only reorders the photos deletes nothing from R2, while an edit that drops one deletes exactly that object, verifies **AC-11**
- Failure case: a removed facility refuses a later edit, and the photo keys it held are gone from R2, verifies **AC-13**, **AC-11**
- Failure case: a 9 MB photo and a `.pdf` renamed to `.jpg` are each refused by the server even though the form allowed them through, verifies **AC-11**
- Failure case: a deep link to a `let` space resolves to null and the screen says it is no longer available, verifies **AC-23**
- Auth/permission: an Administration HOD with no Real Estate role is refused by `createFacility` and gets a not found on both pages; a Real Estate roster member resolves to no shell role and never sees the sidebar entries; a System Admin passes both, verifies **AC-1**, **AC-2**, **AC-3**, **AC-28**

## Build plan

Ordered as Tracer Bullet slices (the project's approach, from the scope header): the contracts and the authority go first because every later slice is gated by them, then one facility is carried end to end through every layer before anything is widened.

1. **Shared contracts and the schema.** Write `packages/shared/src/constants/realEstate.ts` with the status union, the weekday and hours types, every cap and bound, the error codes, the photo content type allowlist, `REAL_ESTATE_DEPARTMENT_NAME`, `REAL_ESTATE_LIST_CAP` and `isFacilityOpenNow` (including its previous day branch), plus its Vitest suite. Then **one** schema push adding `realEstateFloors` and `realEstateSpaces`, the optional new `facilities` fields and the `by_floor` index, and marking the four old fields deprecated in a comment. Then `convex/realEstateMigration.ts` backfilling `imageUrl` into `photos[0]`, stamping `order` from `_creationTime`, and reporting any loose `contactPhone`. Nothing is dropped, so there is no second push and no ordering to get wrong. Satisfies **AC-24**, **AC-25**, **AC-29** (the cap constant), and **AC-22**'s shared helper.
2. **The authority thread.** Add `manageRealEstate` to `DEPARTMENT_CAPABILITIES` and `DEPARTMENT_SCOPED_CAPABILITIES`, repoint `createFacility` and `updateFacility` off `canManageChurchAdmin`, add the two `[slug]` pages as gated shells, and add the two sidebar entries behind `can.manageRealEstate`. Confirm Real Estate is **not** added to `ROSTER_PORTAL_DEPARTMENTS` and `canEnterDepartment` is untouched. Satisfies **AC-1**, **AC-2**, **AC-3**.
3. **Floors.** The six floor functions with the name uniqueness check, the contiguous reorder and the in use refusal, and the Tower page's collapsible floor groups with create, rename, reorder, hide and delete, plus the "Not yet placed" group. Satisfies **AC-5**, **AC-6**, **AC-27**, the portal half of **AC-7**, and **AC-14** for floors.
4. **One facility, end to end (the tracer bullet).** The new shared `ImageGalleryUpload` in `apps/admin/components/ui/`, the facility form with the weekday hours editor and the responsible person toggle, the grown mutations with their validation, photo `getMetadata` checks and R2 cleanup, `facilities.listForPortal`, `facilities.listTowerFacilities` and `facilities.getFacility`, and the mobile Tower screen's Facilities tab with sticky floor headers, its detail screen, "Open now" and the two contact buttons, routed from the More panel's `tower` entry. Satisfies **AC-8** to **AC-13**, **AC-17**, **AC-18**, **AC-19**, **AC-22**, **AC-23**, the app half of **AC-7**, and **AC-14** for facilities.
5. **Spaces to let, end to end.** The five space functions with the price and size validation, the status change and the shared photo handling, the Spaces page, and the mobile Spaces to let tab plus its detail screen with the server resolved contact fallback. Satisfies **AC-15**, **AC-16**, **AC-20**, **AC-21**, and **AC-14** for spaces.
6. **The dashboard cards and the seed.** `realEstate.getDashboardCards` and the three cards in the shared Dashboard's extras slot, then `FACILITY_DRAFT_NAMES` rewritten to SRS 4.14.3's seven names. Satisfies **AC-4**, **AC-26**.
7. **Bounds and the test suite.** Apply `.take(REAL_ESTATE_LIST_CAP)` to every list query, then the Convex tests for the authority matrix, the floor refusals, the responsible person ambiguity, the hours validation, the photo refusals and the member visibility gate. Satisfies **AC-28**, **AC-29**.

## Consequences

**Positive**:
- The Tower stops being a dead More panel entry and three orphan Convex functions nothing calls, and becomes a real surface on both ends.
- The department scoped capability pattern gets its second user, which is what proves it is a pattern rather than a Library special case. Hospitality is next and now has two precedents instead of one.
- `ImageGalleryUpload` lands in `apps/admin/components/ui/` as a shared primitive, so the next department needing a gallery reuses rather than copies. Nothing in the portal had one before.
- Everything ships over the air. No native dependency is added, so unlike spec 0015 this feature needs no preview APK run and is not blocked behind a device test.
- The app visibility gate is derived at read time from five conditions rather than stored, so a facility can never be published in a state that dials nothing, and no flag can go stale.

**Negative / tradeoffs**:
- `facilities` ends up with six optional fields it did not have, and optional is weaker than the schema deserves: `floorId` and `photos` are optional only so the seeded drafts stay valid, which means every reader has to handle absence rather than the type system guaranteeing presence. Tightening them later is a second migration for little gain, so this is permanent.
- Four dead fields stay in the schema, which is untidy and will make someone reading `facilities` wonder which of its eighteen fields are live. The comment naming this spec is the whole mitigation. This is accepted deliberately over the alternative, which was not safely runnable (see Follow-up).
- "Open now" being computed client side means a stale device clock shows the wrong status, and there is nothing the server can do about it. The alternative, re asking the server on a timer, would mean a new subscription per clock tick.
- The fixed UTC+3 assumption is correct today and would be silently wrong if Uganda ever adopted daylight saving. It lives in one constant in `packages/shared`, which is the cheapest place to be wrong.
- Three new tables and roughly twenty new Convex functions is a large surface for one week's feature, and slices 4 and 5 are each genuinely big.
- No pagination is a deliberate deviation from the usual rule. The lists are bounded by `.take()` so nothing is unbounded, but a surprise (someone listing every desk in the building as a facility) would hit the cap with no page control to fall back on.

**Neutral**:
- Administration loses facility write access with no replacement view, which is intended by SRS 4.14.1 but is a capability someone there has today.
- The three already seeded draft facilities stay alongside the seven new SRS ones, so every deployment will carry ten drafts until Real Estate tidies them by hand.
- The seven seeded drafts arrive with no floor, so the Tower page opens on a "Not yet placed" group until Real Estate creates the real floors.
- The weekday hours editor is a new form pattern for this portal; nothing existing edits a seven entry schedule.

## Follow-up

- [ ] **Drop `campusBlock`, `address`, `contactEmail` and `imageUrl` from `facilities`, in a later spec of its own.** AC-25 deliberately leaves them. The reason is the deploy pipeline, not taste: a push to `main` deploys the whole repo's schema to staging automatically (root `AGENTS.md`), so a single PR carrying both the add push and the drop push has no point at which the backfill can run between them. It would either fail schema validation against live rows or drop a column whose data had not moved yet. The safe sequence is this spec's one push plus the backfill, verified in dev and staging and production, then a separate, trivial PR that only removes the four fields. Doing it that way also means a rollback of this feature never takes data with it.
- [ ] An object uploaded to R2 and then abandoned before it is attached to a facility or a space is never reclaimed. This is a property of the shared upload gateway rather than anything this feature introduces, and spec 0015 has it equally, so it is recorded here rather than solved here. It wants a sweep of unreferenced keys, which is one scheduled job for every caller of `convex/uploads.ts` at once. The same applies to an object that was uploaded and then refused by the size or type check.
- [ ] SRS 4.14.3 and `convex/seed.ts` disagree about the Tower's facility names. AC-26 resolves it in the SRS's favour per root `AGENTS.md`, but the three existing drafts (KLT Media Studio, KLT Resource Library, KLT Fellowship Hall) are left in place and someone should confirm whether they are real facilities that belong on the SRS list or leftovers to delete.
- [ ] If any list query ever reaches `REAL_ESTATE_LIST_CAP`, revisit AC-29: that is the signal the "one bounded building" assumption no longer holds and real pagination is owed.
- [ ] Hospitality (scope feature 24) is the third user of the department scoped capability pattern. After this ships, the pattern is worth lifting out of the call sites into a documented convention in `convex/AGENTS.md`.
- [ ] `isFacilityOpenNow`'s fixed UTC+3 offset is a standing assumption about Ugandan time. Worth a line in `packages/shared/AGENTS.md` so nobody reimplements it against the device clock.
