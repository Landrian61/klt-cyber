# 0015. Library: catalogue, free content, stock

**Date**: 2026-11-01
**Status**: In Progress

## Summary

The Library department gets a real catalogue. The Library team keeps one list of everything the church carries, books, flash disk packages, teaching materials, manuals and merchandise, plus free PDFs and audio, and keeps the stock counts current. Any signed in user browses and searches that list on their phone, reads a free PDF or plays free audio in the app, and taps once to WhatsApp or call the Library desk about anything priced.

Two things make this bigger than a catalogue. First, SRS 4.13.2 gives every Library roster member full operational access, but the shared department portal (spec 0012) only knows HOD, delegate and System Admin, so this feature teaches the portal a fourth role and finishes F3-19 for Media and Hospitality at the same time. Second, playing audio in the app needs a native library the mobile app does not have yet, so this feature ships a new installable build rather than an over the air update.

## Requirements

**User stories**:
- As a Library roster member, I add, edit, hide and remove what the church carries, without needing a role appointment first.
- As a Library roster member, I set a starting quantity, record stock going out and coming in, and hear about it when something runs low.
- As a Library roster member, I upload a free PDF or a recording so the congregation can use it in the app.
- As a signed in user, I browse and search what the Library carries and know what it costs before I walk over.
- As a signed in user, I read a free teaching or play a free recording without leaving the app.
- As a signed in user, I see at a glance when something is out of stock, so I do not walk to the desk for nothing.
- As the Library HOD, I set the one number the whole congregation uses to reach the Library desk.

**Acceptance criteria** (the contract, each independently checkable):

Shared shell authority
- **AC-1**: `DepartmentShellRole` gains a fourth value, `roster`. `resolveDepartmentShellRole` returns `roster` when the caller holds no `hod` or `department_admin` role for that department but does hold an `active` `departmentMemberships` row for it, the department's name is in `ROSTER_PORTAL_DEPARTMENTS`, and their `memberProfiles.profileStatus` is `verified`. The existing precedence is unchanged: `system_admin`, then `hod`, then `delegate`, then `roster`. An unverified roster row, or a roster row in any other department, still resolves to null.
- **AC-2**: `DEPARTMENT_CAPABILITIES` gains `manageLibrary`, and `departmentCapabilities` takes the department name as an **optional** second argument, so the twelve existing call sites keep compiling unchanged and only the shell context passes it. `manageLibrary` is granted only when that name is `Library & Information`, and there to `system_admin`, `hod`, `delegate` and `roster` alike; called without a name it is false. A `roster` caller holds `manageLibrary` and nothing else. No other department grants `manageLibrary` to anyone. `requireDepartmentCapability`'s refusal message is reworded, since "Only this department's HOD or a System Admin may" stops being true once a roster member holds a capability.
- **AC-3**: `canEnterDepartment` in `apps/admin/lib/departmentRoutes.ts` admits a roster member of a `ROSTER_PORTAL_DEPARTMENTS` department, so the Areas of Service hub and the department switcher stop offering a door that bounces them straight back out (F3-19). The shell layout agrees with it.
- **AC-4**: the shared Dashboard renders the spec 0012 cards (member counts, claims waiting, recent activity, mentorship) only when the caller holds `viewRoster`. A `roster` caller sees the Library cards and the Settings page's own account panel, and no member counts or claim numbers.
- **AC-5**: three pages exist at `/areas-of-service/[slug]/catalogue`, `/areas-of-service/[slug]/free-content` and `/areas-of-service/[slug]/stock`, each gated on `manageLibrary`; a caller without it gets a not found, not an empty page. The sidebar renders the three entries only when `can.manageLibrary` is true, so no other department shows them.

Catalogue authoring (L1-01 to L1-04)
- **AC-6**: an operator creates an item with title, description, category, author or minister, cover image, format (`physical`, `pdf` or `audio`), type (`book`, `flash_disk_package`, `teaching_material`, `manual`, `merchandise`), optional detail lines, and, for a physical item, a price in shillings and a starting quantity. Every cap comes from `packages/shared` and is enforced again in the mutation.
- **AC-7**: the mutation rejects a `flash_disk_package` or `merchandise` whose format is not `physical`, a `pdf` or `audio` item with no `fileKey`, and a `physical` item with no `priceUgx` or no starting quantity of zero or more. Each refusal names a shared error code the form can map to a sentence.
- **AC-8**: an operator edits every editable field of an item. `format` and `itemType` may be changed only within the same side of the physical and digital line, so an edit can never strand a `priceUgx`, a `quantityOnHand` or a `fileKey`; crossing the line is refused with `LIBRARY_FORMAT_IMMUTABLE` and the team removes the item and creates the right one instead. `updateItem` never writes `quantityOnHand`; only `recordStockMovement` does. Replacing the cover image or the content file schedules the existing `uploads.deleteReplacedObjects` for the object it replaced, and a replaced file's `fileSizeBytes` is re read from R2 rather than carried over.
- **AC-9**: hide sets `hidden: true`, so the item leaves every member surface while the team's own pages keep listing it marked "Hidden". Remove sets `deletedAt`, schedules `uploads.deleteReplacedObjects` for the item's cover and content keys, and clears `coverImageUrl` and `fileKey`, while the row and all its stock movements stay readable. A cover that is an absolute URL rather than an R2 key is skipped, which `toR2Key` in `convex/lib/media.ts` already decides. A removed item refuses every later mutation with `LIBRARY_ITEM_NOT_FOUND`, including a further hide, edit or stock movement; a hidden item still accepts all of them.
- **AC-10**: every create, edit, hide, remove, stock movement and category change writes an `activityLogs` entry carrying `departmentId` set to Library, so the department's own feed and the audit trail both see it.

Categories (L1-01, "Categories editable")
- **AC-11**: an operator adds, renames, reorders and hides a category. A new category is appended at `max(order) + 1`; a reorder renumbers its siblings contiguously from zero in one mutation, so no two categories share an `order`. A duplicate name is refused case insensitively, on rename as well as on create. A category still referenced by at least one item that is not removed can only be hidden; deleting it is refused and the refusal says how many items still use it. An empty category, including one whose last item has since been removed, may be deleted outright.
- **AC-12**: a hidden category disappears from the member filter chips and from the new item form, and the items already filed under it keep showing its name rather than reading as uncategorised.

Member browse (L1-05, L1-06, L3-04, M10-01)
- **AC-13**: any signed in user, visitor or member, opens the Library screen and sees every item that is neither hidden nor removed, ordered by `createdAt` descending then `_id` descending so the order is stable when two items share a timestamp, with cover, title, author and category. A caller with no session gets nothing back, per F3-08. The screen renders a loading skeleton, an explicit empty state, and the shared error state with a retry when the query fails, just as the dashboard cards do.
- **AC-14**: the screen offers a format segment (All, Physical, Free) and an `itemType` chip row, and searches case insensitively on a substring of title or author. The segment, the chips and the search narrow together rather than replacing one another, all client side over the loaded list. An empty result says so. A category whose row has since been hidden stays selectable while it is the active filter and disappears on the next load.
- **AC-15**: a physical item shows its price formatted as `USh 25,000` beside "Available at the Library desk", with a WhatsApp button and a call button both built from `departments.contactPhone` stored in E.164 form: `tel:` uses it as stored and `wa.me` uses it with the leading `+` stripped. When no number is set, the price and the desk line still show and neither button renders. The number reaches the client only through `getCatalogueItem`, never on a list card that has no use for it.
- **AC-16**: a physical item whose `quantityOnHand` is zero shows "Out of stock" on both the card and the detail screen. The contact buttons stay, because a member may reasonably ask when it is back. A member is never shown the actual count, only whether it is zero, so the Library's stock position stays internal.
- **AC-17**: a deep link to an item that is hidden, removed or gone resolves to null rather than throwing, and the screen says the item is no longer available. The id arrives as a string and is resolved with `normalizeId`, so a malformed id is also a null rather than a thrown argument validation error.

Free content (L2-01, L2-02)
- **AC-18**: an operator uploads a PDF or an MP3 or M4A of at most `LIBRARY_FILE_MAX_BYTES` (25 MB) with title, description, category, author and cover, through the existing R2 gateway in `convex/uploads.ts`. The form checks the file before uploading, and `createItem` and `updateItem` then read the object's real size and content type back from R2 with `getMetadata(key)` and store what R2 reports, never what the client claimed. A size over the cap, or a content type outside `application/pdf`, `audio/mpeg` and `audio/mp4`, is refused with `LIBRARY_FILE_TOO_LARGE` or `LIBRARY_FILE_TYPE_UNSUPPORTED`. A cover image is capped separately at `LIBRARY_COVER_MAX_BYTES` (5 MB) and must be an image content type.
- **AC-19**: a digital item is marked "Free" everywhere it appears, carries no price and no desk line, and has no stock count.
- **AC-20**: tapping a free PDF opens it in an in app browser sheet. Tapping free audio plays it in an in app player with play and pause, a progress bar, and elapsed and total time set in the mono numeral face. The player shows a buffering state while the file loads, and a file that cannot be opened says "could not open this file, try again" rather than failing silently. Playback pauses when the member leaves the screen and the player is released on unmount.
- **AC-21**: there is no download and no share action, and no signed URL is ever stored on a document or in client state. The URL comes from a one shot action, `library.getItemFileUrl`, called when the member taps, not from the reactive item query, so a live subscription cannot re sign the URL underneath a playing file or an open sheet. It is signed for one hour, long enough for a teaching and short enough that a leaked link expires.

Stock (L3-01 to L3-04)
- **AC-22**: a physical item's starting quantity is written as its first `in` movement at creation, so the count never moves without a movement behind it.
- **AC-23**: an operator records an `in` or `out` movement with a positive whole quantity and an optional note. The mutation reads the item's current `quantityOnHand`, computes `quantityAfter` from that freshly read value rather than from any client input, and writes the movement and the item in the same transaction, so the two can never disagree. Convex's optimistic concurrency retry is what makes two simultaneous movements safe: the loser re reads and either succeeds against the new count or is refused by AC-24. A movement against a digital item is refused with `LIBRARY_STOCK_NOT_PHYSICAL`, and a quantity that is zero, negative or fractional with `LIBRARY_STOCK_QUANTITY_INVALID`.
- **AC-24**: an `out` movement larger than the current count is refused with `LIBRARY_STOCK_INSUFFICIENT`, and `quantityOnHand` never goes below zero.
- **AC-25**: the Stock page lists an item's movements by `createdAt` descending then `_id` descending, capped at 50 with a "load more", showing direction, quantity, the resulting count, the note and who recorded it. Account deletion anonymises the `users` row rather than removing it (`convex/accountDeletion.ts`), so `actorUserId` always resolves; a row whose user is anonymised or whose name is gone renders as "a former member" rather than blank.
- **AC-26**: N43 fires once, when a movement takes the count from above `LIBRARY_LOW_STOCK_THRESHOLD` (10) to at or below it and `lowStockNotifiedAt` is unset. `lowStockNotifiedAt` is stamped; a further movement that leaves the count at or below the threshold sends nothing, including one that reaches zero; a movement that lifts it back above the threshold clears the stamp, so the next crossing alerts again. The notice is scheduled with `ctx.scheduler.runAfter(0, …)` on `notifications.dispatch` from inside the mutation rather than sent inline, since a mutation cannot push. Recipients are the union of `resolveDepartmentAudience` for Library (its `active` roster rows whose profile is `verified`) and `resolveRoleAudience` for Library's active `hod` and `department_admin`, deduplicated by user id, delivered as a push and an in app notice that the portal bell reads. The operator who recorded the movement is not excluded, matching how N22 treats its own actor. N43 is not a category a user can switch off, which is what the SRS table's "No" column means.
- **AC-27**: an item created with a starting quantity already at or below the threshold alerts once at creation, by the same crossing rule with the previous count treated as unbounded.

Library dashboard (SRS 4.13.3)
- **AC-28**: the shared Dashboard gains a per department extras slot: the shared Dashboard component takes an optional `extras` node, and the `[slug]` dashboard page passes Library's cards when `can.manageLibrary` is true, so no department registry is needed and nothing renders for a department with no extras. The extras sit below the shared cards and are shown to every role that holds `manageLibrary`, roster members included. Library fills it with four cards: total items that are not removed (hidden ones included, since this is the team's own view), the count of **physical** items at or below the threshold with removed ones excluded, the five most recently added items that are neither hidden nor removed, and the four newest free items as highlights. Each card renders an explicit empty state, and a failed query shows the shared `ErrorState` with a retry.

Department contact number (L1-06)
- **AC-29**: the department's HOD sets and clears `contactPhone` on the existing shared Settings page. It is stored in E.164 form (`+` then up to 15 digits, no separators), normalised on the way in and validated by one shared regex that `facilities.contactPhone` also adopts, so the portal has one phone format rather than two. An invalid value is refused with `DEPARTMENT_CONTACT_PHONE_INVALID`, and an empty string clears the field. It saves immediately and writes an `activityLogs` entry; an unchanged save writes none. A delegate, a roster member or any other caller is refused by the server, exactly as the description editor is.

Mobile entry (M10-01)
- **AC-30**: the `library` entry already sitting in the mobile More panel routes to the Library screen instead of doing nothing.

Shared contracts and tests
- **AC-31**: every new union, cap, threshold, error code and the shillings price formatter live in `packages/shared/src/constants/library.ts` with unit tests, and the formatter's output agrees with `formatCostAmount(amount, "UGX")` so money reads identically on both surfaces. The caps are: title 160, description 2000, author 120, category name 60, detail line 120, at most 20 detail lines, stock note 280, file 25 MB, cover 5 MB, price between 0 and 100,000,000 shillings, and a starting quantity between 0 and 1,000,000. The literal department name `LIBRARY_DEPARTMENT_NAME` is exported here too, rather than written inline wherever the department is looked up by name.
- **AC-32**: Convex tests cover the authority matrix (a Library roster member holds `manageLibrary` and nothing else; a roster member of a department outside `ROSTER_PORTAL_DEPARTMENTS` resolves to no role; an unverified roster member resolves to no role; `manageLibrary` is false for every other department and false when the department name is not passed), the negative stock guard, the format and type immutability rule, and the N43 crossing latch in both directions.

## Decision

**Chosen option**: Option 2: one item table on the shared portal shell, with a fourth shell role.

Model the whole catalogue as one `libraryItems` table split by a `format` axis rather than by paid and free, host Library's three pages on the existing dynamic `[slug]` shell behind a new `manageLibrary` capability, and give the shared shell a `roster` role so SRS 4.13.2's "every roster member" rule is satisfied once, in the one place the portal already computes authority.

**Implementation skills**: `convex` (`.claude/skills/convex/`) for the schema, function and scheduler conventions · `shadcn` (`.claude/skills/shadcn/`) for the portal's component primitives · `mobile-frontend-design` (`.claude/skills/mobile-frontend-design/`) for the Library screen, the player and the list interactions

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`libraryCategories` (new), the editable category list behind L1-01.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | trimmed, within `LIBRARY_CATEGORY_NAME_MAX_LENGTH` |
| `order` | number | yes | the order the filter chips and the form's options render in |
| `hidden` | boolean | yes | retire a category without stranding the items on it |
| `createdBy` | `Id<"users">` | yes | |
| `createdAt`, `updatedAt` | number | yes | |

Index: `by_order` on `["order"]`.

`libraryItems` (new), one table for everything the Library carries, paid or free.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | within `LIBRARY_TITLE_MAX_LENGTH` |
| `description` | string | no | within `LIBRARY_DESCRIPTION_MAX_LENGTH` |
| `categoryId` | `Id<"libraryCategories">` | yes | many items to one category |
| `author` | string | no | "author or minister" in L1-01 |
| `coverImageUrl` | string | no | an R2 object key, or an absolute URL for seeded art, resolved by `resolveMediaUrl` |
| `format` | `"physical" \| "pdf" \| "audio"` | yes | the physical against digital axis |
| `itemType` | `"book" \| "flash_disk_package" \| "teaching_material" \| "manual" \| "merchandise"` | yes | `flash_disk_package` and `merchandise` only with `format: "physical"` |
| `detailLines` | `string[]` | no | "Contains" for a package (L1-02), "Variants" for merchandise (L1-03); at most `LIBRARY_DETAIL_LINES_MAX` entries, each within `LIBRARY_DETAIL_LINE_MAX_LENGTH` |
| `priceUgx` | number | physical only | whole shillings, never on a digital item |
| `fileKey` | string | digital only | the R2 key of the PDF or audio object |
| `fileSizeBytes` | number | digital only | read back from R2 with `getMetadata`, never taken from the client, so the member sees a true weight before opening it |
| `fileContentType` | string | digital only | likewise read back from R2; the value the 25 MB and allowlist check is made against |
| `audioDurationSeconds` | number | no | audio only; the Library team may type it in, and the player falls back to the file's own metadata when it is absent, so nothing depends on it being filled |
| `quantityOnHand` | number | physical only | the current count, never below zero |
| `lowStockNotifiedAt` | number | no | the N43 latch; cleared when the count rises back above the threshold |
| `hidden` | boolean | yes | L1-04 hide |
| `deletedAt` | number | no | L1-04 remove, soft, so stock history survives |
| `createdBy` | `Id<"users">` | yes | |
| `createdAt`, `updatedAt` | number | yes | |

Indexes: `by_visibility` on `["deletedAt", "hidden", "createdAt"]` (the member browse and recent additions, newest first) · `by_category` on `["categoryId"]` · `by_format` on `["format", "createdAt"]` (the free highlights card needs the newest four, so the index carries the order) · `by_stock` on `["deletedAt", "format", "quantityOnHand"]` (the low stock card; `format` sits in the key because a digital item has no `quantityOnHand` and an undefined value sorts first in Convex, so an index without it would count every PDF as low stock).

Ties on `createdAt` are broken by `_id` descending wherever an order is shown, so a list does not shuffle between two items saved in the same millisecond.

`libraryStockMovements` (new), the audit trail L3-02 asks for, quantities only, never money.

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemId` | `Id<"libraryItems">` | yes | many movements to one item |
| `direction` | `"in" \| "out"` | yes | |
| `quantity` | number | yes | a positive whole number |
| `quantityAfter` | number | yes | the resulting count, so the page shows a running balance without summing the history |
| `note` | string | no | within `LIBRARY_STOCK_NOTE_MAX_LENGTH` |
| `actorUserId` | `Id<"users">` | yes | |
| `createdAt` | number | yes | |

Index: `by_item` on `["itemId", "createdAt"]`.

`departments` (existing) gains `contactPhone: v.optional(v.string())`, editable by that department's HOD on the shared Settings page, serving both the `wa.me` link and the `tel:` link. Real Estate's RE2-04 needs exactly this field in the same week, so it is added generically rather than as a Library only record.

**State transitions**:

An item's visibility: `visible` (neither flag set) ⇄ `hidden` (`hidden: true`, reversible) → `removed` (`deletedAt` set, terminal; the R2 objects are gone and every later mutation is refused, so it is not reversible as a live item). Either of the first two states may go to `removed`.

A physical item's low stock latch: `armed` (`lowStockNotifiedAt` unset) → `notified` (a movement, or the item's creation, brings the count to at or below the threshold; N43 sent, stamp written) → `armed` (a movement lifts the count back above the threshold; stamp cleared). While `notified`, no further movement alerts, including one that reaches zero. At creation the previous count is treated as unbounded, so an item born at or below the threshold alerts once.

**API surface** (Convex functions; `operator` means a caller holding `manageLibrary`, so Library's HOD, its delegates, its verified roster and a System Admin):

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `library.listCategories` | query | none | `[{ _id, name, order, hidden, itemCount }]` | operator | null when no role |
| `library.createCategory` | mutation | `name` (req) | `categoryId` | operator | `LIBRARY_CATEGORY_NAME_TOO_LONG`, `LIBRARY_CATEGORY_DUPLICATE` |
| `library.updateCategory` | mutation | `categoryId` (req), `name` (opt), `order` (opt), `hidden` (opt) | `null` | operator | `LIBRARY_CATEGORY_NOT_FOUND` |
| `library.deleteCategory` | mutation | `categoryId` (req) | `null` | operator | `LIBRARY_CATEGORY_IN_USE` (names the count) |
| `library.listItemsForTeam` | query | `search` (opt), `format` (opt), `includeHidden` (opt) | items with `quantityOnHand`, `hidden`, `priceUgx` | operator | null when no role |
| `library.getItemForTeam` | query | `itemId` (req) | the full item plus its recent movements | operator | null when no role |
| `library.createItem` | mutation | `title`, `categoryId`, `format`, `itemType` (req); `priceUgx`, `startingQuantity`, `fileKey`, `fileSizeBytes`, `coverImageUrl`, `author`, `description`, `detailLines` (conditional) | `itemId` | operator | `LIBRARY_TYPE_FORMAT_MISMATCH`, `LIBRARY_PRICE_REQUIRED`, `LIBRARY_QUANTITY_REQUIRED`, `LIBRARY_FILE_REQUIRED`, `LIBRARY_FILE_TOO_LARGE` |
| `library.updateItem` | mutation | `itemId` (req), any editable field (opt); never `quantityOnHand` | `null` | operator | the create errors, plus `LIBRARY_ITEM_NOT_FOUND`, `LIBRARY_FORMAT_IMMUTABLE` |
| `library.setItemHidden` | mutation | `itemId`, `hidden` (req) | `null` | operator | `LIBRARY_ITEM_NOT_FOUND` |
| `library.removeItem` | mutation | `itemId` (req) | `null` | operator | `LIBRARY_ITEM_NOT_FOUND` |
| `library.recordStockMovement` | mutation | `itemId`, `direction`, `quantity` (req), `note` (opt) | `{ quantityAfter, lowStockAlerted }` | operator | `LIBRARY_STOCK_INSUFFICIENT`, `LIBRARY_STOCK_NOT_PHYSICAL`, `LIBRARY_STOCK_QUANTITY_INVALID` |
| `library.listStockMovements` | query | `itemId` (req), `limit` (opt, default 50) | movements newest first with actor display names | operator | null when no role |
| `library.getLibraryDashboard` | query | none | `{ totalItems, lowStockCount, recentAdditions, freeHighlights }` | operator | null when no role |
| `library.listCatalogue` | query | none | visible items with resolved cover URLs, price, free flag, stock state | any signed in user | null when no session |
| `library.getCatalogueItem` | query | `itemId` (req, a string resolved with `normalizeId`) | the item, its detail lines, its stock state, and the department's `contactPhone`; no file URL | any signed in user | null when hidden, removed, missing or malformed |
| `library.getItemFileUrl` | action | `itemId` (req) | `{ url }`, signed for one hour | any signed in user | null when the item is hidden, removed or has no file |
| `departmentShell.updateContactPhone` | mutation | `departmentId`, `contactPhone` (req, may be empty to clear) | `null` | that department's HOD, or System Admin | `DEPARTMENT_CONTACT_PHONE_INVALID`, not authorised |

File cleanup reuses the existing `uploads.deleteReplacedObjects` internal action (scheduled today from `convex/lib/mediaCleanup.ts`), which already takes a key array, swallows a per key failure and reports it to Sentry. This spec adds no cleanup action of its own.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| `listCatalogue` | the price text `USh 25,000` | `libraryItems.priceUgx`, formatted by `formatUgx` in `packages/shared` |
| `listCatalogue` | the "Free" marker | derived: `format !== "physical"` |
| `listCatalogue` | `"Out of stock"` | derived: `format === "physical" && quantityOnHand === 0` |
| `listCatalogue` | the cover image URL | `libraryItems.coverImageUrl` through `resolveMediaUrl`, which already applies the seven day content TTL |
| `createItem`, `updateItem` | the STORED `coverImageUrl` | one of two sources, both ending in an ordinary R2 key: the operator's own upload through the `uploads` gateway (AC-6), or one of the first three pages of an attached PDF, rendered in the portal and adopted by the operator (spec [0016](../0016-library-pdf-preview-and-page-one-covers/index.md)). Nothing downstream branches on which, and the server side cover checks in AC-18 apply to both |
| `listCatalogue` | the category name on a card | `libraryCategories.name` by `categoryId`, hidden categories included so an item never reads as uncategorised (AC-12) |
| `getCatalogueItem` | the WhatsApp link and the call link | `departments.contactPhone` on the Library department row, found through the `by_name` index on `LIBRARY_DEPARTMENT_NAME` from `packages/shared`; stored E.164, with the `+` stripped for `wa.me` and kept for `tel:`; absent means no buttons (AC-15) |
| `getItemFileUrl` | the signed file URL | `libraryItems.fileKey` through `r2.getUrl` with a one hour expiry, inside a one shot action so no reactive rerun re signs it, and never stored (AC-21) |
| `getCatalogueItem` | audio total time | `libraryItems.audioDurationSeconds` when the team typed one in, else the player's own metadata once the file loads (AC-20) |
| `createItem`, `updateItem` | `fileSizeBytes` and `fileContentType` | `getMetadata(fileKey)` on the R2 object, read server side; the client's claimed values are discarded (AC-18) |
| `createItem` | the first `in` movement | derived from the `startingQuantity` input (AC-22) |
| `recordStockMovement` | `quantityAfter` | computed in the mutation from the item's current `quantityOnHand` and the signed quantity, written in the same transaction (AC-23) |
| `recordStockMovement` | whether N43 fires | derived: the count was above `LIBRARY_LOW_STOCK_THRESHOLD` before and is at or below it after, and `lowStockNotifiedAt` is unset (AC-26) |
| `recordStockMovement` | the N43 recipient list | the union of `resolveDepartmentAudience(libraryDepartmentId)` (its `active` roster rows whose profile is `verified`) and `resolveRoleAudience` for Library's active `hod` and `department_admin`, both already in `convex/notifications.ts`, deduplicated by user id; the actor is not excluded (AC-26) |
| `recordStockMovement` | the delivery itself | `ctx.scheduler.runAfter(0, internal.notifications.dispatch, …)`, since a mutation cannot push directly (AC-26) |
| `listStockMovements` | who recorded a movement | `libraryStockMovements.actorUserId` joined to the user's name. The row always resolves, because account deletion anonymises the `users` document rather than removing it; an anonymised or nameless row renders "a former member" (AC-25) |
| `getLibraryDashboard` | `lowStockCount` | an indexed read on `by_stock` with `deletedAt` unset and `format` equal to `physical`, counting `quantityOnHand <= LIBRARY_LOW_STOCK_THRESHOLD`; hidden items are included, since this is the team's own view (AC-28) |
| `getLibraryDashboard` | `totalItems` | an indexed read on `by_visibility` with `deletedAt` unset, hidden items included (AC-28) |
| `getLibraryDashboard` | `recentAdditions` | `by_visibility` with `deletedAt` unset and `hidden` false, descending `createdAt`, capped at five (AC-28) |
| `getLibraryDashboard` | `freeHighlights` | `by_format` descending `createdAt` for the digital formats, filtered to not hidden and not removed, capped at four (AC-28) |
| `deleteCategory` | the count inside `LIBRARY_CATEGORY_IN_USE` | an indexed read on `by_category` filtered to `deletedAt` unset, so removing the last live item does unblock the delete (AC-11) |
| `createCategory` | the new row's `order` | `max(order) + 1` over the existing rows; a reorder renumbers siblings contiguously from zero in one mutation, so `order` is effectively unique (AC-11) |
| `getShellContext` | `can.manageLibrary` | `departmentCapabilities(role, department.name)`, where the name comes from the department document the slug already resolved. The second argument is optional, so the other eleven call sites stay as they are and read `manageLibrary` as false (AC-2) |
| the Dashboard page | whether to render Library's extras | `can.manageLibrary` from the shell context, passed as the shared Dashboard's optional `extras` node; no department registry exists (AC-28) |
| every mutation | the `activityLogs` entry's `departmentId` | the Library department document the mutation already loaded (AC-10) |
| every mutation | the `activityLogs` `action` string | a new `LIBRARY_FEED_ACTIONS` set in `packages/shared`, following the `DEPARTMENT_FEED_ACTIONS` pattern: `library.item_created`, `library.item_updated`, `library.item_hidden`, `library.item_removed`, `library.stock_recorded`, `library.category_changed`. `targetType` is `libraryItem` or `libraryCategory` with the row id as `targetId` (AC-10) |

**Key invariants**:
- An item is physical or digital, never both and never neither: `priceUgx` and `quantityOnHand` are present only when `format` is `physical`, and `fileKey`, `fileSizeBytes` and `fileContentType` only when it is not. An edit may never move an item across that line, so the invariant holds for the row's whole life.
- `recordStockMovement` is the only writer of `quantityOnHand`. Any second writer is a bug.
- `quantityOnHand` always equals the signed sum of that item's `libraryStockMovements`, and is never below zero. Both are written in one transaction from a freshly read count, so there is no window in which they disagree and no lost update under concurrency.
- Every movement's `quantityAfter` equals the item's `quantityOnHand` immediately after that movement.
- `fileSizeBytes` and `fileContentType` always reflect what R2 reports about the object, never what a client said about it.
- `manageLibrary` is the only capability a `roster` role ever holds, and it is held only for `Library & Information`.
- A removed item keeps its row and its movements, holds no R2 keys, and accepts no further mutation.
- A category referenced by a live item is never deleted, only hidden. No two categories share an `order`.
- A signed URL is never persisted, on a document or in client state, and is never produced by a reactive query.

**Security model**:
- **Read, member facing**: `listCatalogue` and `getCatalogueItem` require a session and nothing more, per F3-08 and NF-17. Both exclude hidden and removed items, so a member cannot reach one by guessing an id. No personal data comes back: an item carries no reference to who created it.
- **Read, team facing**: every operator query resolves through the shell context and returns null rather than throwing when the caller has no role, so a page survives a sign out or a lost role while it is mounted. That is the spec 0012 rule and this feature keeps it.
- **Write**: every mutation calls `requireDepartmentCapability(ctx, libraryDepartmentId, "manageLibrary")`, which throws. The portal's navigation and buttons are convenience; this is the boundary.
- **The one HOD only write** is `updateContactPhone`, gated exactly as the description editor is, because the number it sets is what the whole congregation taps.
- **Uploads** go through the existing `convex/uploads.ts` gateway, which requires a session to issue an upload URL but checks neither size nor type, because it cannot know what a key is for. The real check therefore happens in the mutation that attaches the key, and it reads the object's metadata from R2 rather than believing the client, which is what makes the limit an actual limit rather than a form hint.
- **A known limit worth naming**: `uploads.getFileUrl` lets any signed in session sign any key it can name. A hidden item's file key is therefore still signable by someone who already knows the key. Nothing in this feature leaks a key for a hidden item, and the keys are opaque, so this is not a new hole; but `library.getItemFileUrl` deliberately re checks the item's visibility rather than relying on the generic resolver, so the Library path fails closed on its own.
- **No regulated data.** The catalogue is church content, prices are public, and a stock movement records only a quantity and an actor id. No payment data and no personal data beyond the actor reference the audit trail needs.
- **Audit**: `activityLogs` carries every consequential write, with `departmentId`, so a disputed stock count or a vanished item is traceable.

**Configuration required**: none. R2 is already provisioned and its credentials already live in the Convex deployment environment (`spec/STORAGE.md`). The one build time change is the `expo-audio` dependency added in slice 6, which is a native module. Slices 1 to 5 and 7 to 9 still reach devices over the air as usual; only slice 6 onward needs a fresh build from the manual "Build (preview APK)" workflow, so the APK is a step inside one slice rather than a gate on the whole feature.

**Critical test scenarios**:
- Happy path: an operator creates a priced physical book with a starting quantity of 30, and a signed in visitor sees it on the Library screen with its price, the desk line and both contact buttons, verifies **AC-6**, **AC-13**, **AC-15**
- Happy path: an operator uploads a 4 MB teaching PDF and a member opens it in the browser sheet, then plays a free recording in the in app player, verifies **AC-18**, **AC-20**
- Failure case: an `out` movement of 5 against a count of 3 is refused with `LIBRARY_STOCK_INSUFFICIENT` and the count stays 3, verifies **AC-24**
- Failure case: two operators record an `out` of 1 against a count of 1 at the same moment; one succeeds, the other is refused, and the count lands on zero rather than minus one, verifies **AC-23**, **AC-24**
- Failure case: a count moves 12 → 8 → 6 → 14 → 9 and exactly two N43 notices are sent, verifies **AC-26**
- Failure case: a client claims a 2 MB `fileSizeBytes` for a 40 MB object already in R2, and `createItem` reads the real size back and refuses it, verifies **AC-18**
- Failure case: an edit tries to turn a priced physical book into a `pdf` and is refused with `LIBRARY_FORMAT_IMMUTABLE`, leaving the price and the count intact, verifies **AC-8**
- Failure case: audio plays while the item query reruns (another operator edits the item's description); the URL does not change underneath the player and playback does not restart, verifies **AC-21**
- Failure case: the low stock card is read with ten free PDFs and no low physical item, and reports zero rather than ten, verifies **AC-28**
- Failure case: deleting a category with 12 live items is refused and the message names 12, verifies **AC-11**
- Failure case: a member opens a deep link to an item removed a minute ago and sees "no longer available" rather than a crash, verifies **AC-17**
- Auth and permission: a verified Library roster member with no role appointment reaches Catalogue, Free content and Stock, and is refused by the server on `confirmClaim`, `sendMessage`, `addMember` and `updateContactPhone`, verifies **AC-1**, **AC-2**, **AC-4**, **AC-29**
- Auth and permission: a verified Finance roster member resolves to no shell role and `/areas-of-service/finance/catalogue` is not found, verifies **AC-1**, **AC-5**
- Auth and permission: an unverified user who self added a Library roster row during profile submission resolves to no shell role, verifies **AC-1**
- Auth and permission: `listCatalogue` with no session returns nothing, verifies **AC-13**

## Build plan

Tracer Bullet, per the scope header: a thin thread runs through shared contracts, Convex, the portal and the phone before any one layer is thickened. Slice 3 is deliberately the authority thread rather than the catalogue, because every later slice is gated on it and it is the one piece that reaches into shared shell code.

1. Add the shared contracts: `packages/shared/src/constants/library.ts` holding the format and type unions, every cap and bound from AC-31, `LIBRARY_LOW_STOCK_THRESHOLD`, `LIBRARY_DEPARTMENT_NAME`, the error codes, the file and cover limits with their content type allowlists, `LIBRARY_FEED_ACTIONS`, the shared E.164 phone regex, and `formatUgx` with its parity test against `formatCostAmount(amount, "UGX")`, satisfies **AC-31**
2. Add the schema in one migration: `libraryCategories`, `libraryItems` and `libraryStockMovements` with the four indexes as specified (`by_stock` carrying `format`, `by_format` carrying `createdAt`), plus `departments.contactPhone`, satisfies **AC-6**, **AC-22**, **AC-23**, **AC-29**
3. Run the authority thread end to end: widen `DepartmentShellRole` with `roster` and `resolveDepartmentShellRole` with the verified roster branch, rewriting its doc comment; add `manageLibrary` and give `departmentCapabilities` an optional department name argument, leaving the other eleven call sites untouched; reword `requireDepartmentCapability`'s refusal message; fix `canEnterDepartment`; gate the shared Dashboard's spec 0012 cards on `viewRoster` and give it the optional `extras` node; add the three `[slug]` routes rendering empty states behind `manageLibrary`; add the sidebar entries; write the Convex matrix tests, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-32**
4. Run the first product thread end to end: `createItem` and `listCatalogue`, the portal Catalogue list with a create form, the mobile Library screen listing what comes back, and the More panel entry wired to it, satisfies **AC-6**, **AC-7**, **AC-13**, **AC-30**
5. Thicken the catalogue at both ends: categories (append at `max(order) + 1`, rename with the duplicate guard, contiguous reorder, hide, guarded delete); edit with the format immutability rule, hide, and remove with the reused `uploads.deleteReplacedObjects` cleanup and its absolute URL skip; the `activityLogs` actions; the contact number on Settings with the shared E.164 validator; then the mobile format segment, type chips and search, the detail screen, the price and desk line, the contact buttons, the "Out of stock" label, and the `normalizeId` deep link, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-14**, **AC-15**, **AC-16**, **AC-17**, **AC-29**
6. Run the free content thread: the upload with the server side `getMetadata` size and content type check for both file and cover, the portal Free content page, the "Free" marking, install `expo-audio` and cut a fresh preview APK, the one shot `getItemFileUrl` action, the PDF browser sheet, and the in app audio player with its buffering and failure states, its pause on blur and its release on unmount, satisfies **AC-18**, **AC-19**, **AC-20**, **AC-21**
7. Run the stock thread: the starting quantity as a first `in` movement, `recordStockMovement` reading the current count and writing both documents in one transaction with the insufficient stock, non physical and invalid quantity guards, the Stock page, and the capped movement list with its former member fallback, satisfies **AC-22**, **AC-23**, **AC-24**, **AC-25**
8. Close the loop with the alert and the dashboard: the N43 crossing latch, the deduplicated recipient union over `resolveDepartmentAudience` and `resolveRoleAudience`, the scheduled `notifications.dispatch`, and the four Library cards passed into the Dashboard's `extras` node with their empty and error states, satisfies **AC-26**, **AC-27**, **AC-28**
9. Finish the tests: the negative stock guard, the format immutability rule, the crossing latch in both directions, and the remaining authority cases, satisfies **AC-32**

## Consequences

**Positive**:
- The congregation gets the catalogue and the free material, and the Library team gets one place to run it, with no new infrastructure: three tables, the R2 gateway that already exists, and the portal shell that already exists.
- F3-19 finally works. Media and Hospitality roster members get into their own portals as a side effect, and the next department with its own pages, Real Estate in the same week, lands them on the same `[slug]` route behind its own capability.
- `departments.contactPhone` and the Dashboard extras slot are both generic, so Real Estate's RE2-04 and Hospitality's own cards reuse them rather than copying them.
- One item table means one search surface, one cover pipeline and one member browse, so free content is discoverable beside everything else instead of hidden behind its own screen.
- The audio player primitive this builds is what Radio core (feature 20) needs in week 4, so the native dependency is paid for once.

**Negative and tradeoffs**:
- This feature edits shared shell code that several in progress features also touch (`convex/lib/authz.ts`, `convex/departmentShell.ts`, the sidebar, the Dashboard), so a rebase during week 3 is likely to be noisy. Making the department name an optional second argument keeps that to the one call site that needs it rather than all twelve, but the role union itself still widens under everyone.
- `expo-audio` is a native module, so slice 6 onward cannot reach a device over the air. Every tester needs a new APK from the manual build workflow at that point, which is a real interruption in the middle of a week 3 slice.
- The server side file check costs an extra R2 metadata read on every create and every edit that touches a file. That is the price of the limit being real rather than advisory.
- `getItemFileUrl` being an action rather than part of the item query means opening a file is a second round trip, so there is a brief wait between the tap and the sheet or the first note of audio.
- `quantityOnHand` is a stored derived value, which is normally a smell. It is justified only because the member browse would otherwise read a whole movement history per item just to decide whether to print "Out of stock". The invariant that keeps it honest lives in one mutation, so any future second writer of that field is a bug.
- Client side search means the whole visible catalogue goes to every device on every open, and `listCatalogue` signs one cover URL per item on every reactive rerun, which is the larger of the two costs. Fine at tens or low hundreds of items; past roughly a thousand it becomes a real payload, and the fix is the Convex search index and pagination this spec chose not to build.
- An object uploaded to R2 whose form is then abandoned is an orphan nobody deletes, because a key is only attached on submit. At this volume that is a handful of files, and a sweep is listed as deferred rather than built.
- Removing an item deletes its files, so a removal cannot be undone as a live item. The row stays for the audit trail, but the PDF is gone.
- One `format` plus one `itemType` union means some combinations are nonsense (`merchandise` as a PDF) and are prevented by a mutation rule rather than by the type system.

**Neutral**:
- A fourth shell role is a new concept for anyone reading the portal's authority code, and the long doc comment on `resolveDepartmentShellRole` explaining why a roster member gets nothing becomes wrong, so it must be rewritten rather than extended.
- `packages/shared` gains a `library.ts` constants module, following the `profileLifecycle.ts` and `departmentShell.ts` pattern.
- Library is the first feature to add a page to the `[slug]` shell that only one department can open, so it sets that pattern for Hospitality and Real Estate.

## Follow-up

- [ ] This feature depends on spec 0006 (`hasPortalAccess`, `ROSTER_PORTAL_DEPARTMENTS`), which is still `In Progress`. Confirm 0006's roster portal access has actually landed before starting slice 3, or slice 3 builds on a front door that is not open yet.
- [ ] Spec 0012's `verify.md` has a "Rita the roster member" account it expects to be turned away from every page inside a department. AC-4 deliberately changes that for the three `ROSTER_PORTAL_DEPARTMENTS`, so update 0012's verify steps when this ships rather than letting `/check verify` fail on a rule that was changed on purpose.
- [ ] `apps/mobile/AGENTS.md` should record that the app now carries a native audio dependency, so a future contributor knows an audio change cannot ship over the air.
- [ ] Feature 20 (Radio core) should reuse the audio player primitive this builds rather than writing a second one. Worth a line in that feature's spec when it is designed.
- [ ] Decide whether Hospitality gets the same `roster` operational treatment. SRS 4.13.2 is written for Library; whether Hospitality's roster members have equivalent rights over visitors and follow ups is a question for feature 24's spec, and this feature makes it cheap to answer either way.
- [ ] Deferred, not built here: a sweep that deletes R2 objects uploaded but never attached to an item. Worth enrolling once the storage figure in the cost register (feature 31) shows it matters.
- [ ] `uploads.getFileUrl` signs any key for any signed in session. This feature works around it with its own visibility re check, but the generic resolver is worth tightening across the platform; that is a cross cutting decision, not Library's to make.
- [ ] Changing `LIBRARY_LOW_STOCK_THRESHOLD` later leaves existing `lowStockNotifiedAt` stamps set against the old number, so the first crossing after a change may be missed on items already stamped. Acceptable for a constant nobody expects to change; worth a one off clearing script if it ever does.
- [ ] `facilities.contactPhone` is adopting the shared E.164 validator in this feature, but its existing rows are unvalidated free text. Worth a look at whether any of them fail the new regex before Real Estate (feature 26) relies on it.
