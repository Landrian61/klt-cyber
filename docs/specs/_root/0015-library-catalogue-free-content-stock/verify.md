# Verify: Library catalogue, free content, stock · spec 0015 · updated 2026-11-01
_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Before you start

You need four accounts to tell the refusals apart. Set them up once and reuse them:

- **Lydia the Library HOD**: an active `hod` role scoped to Library & Information.
- **Dan the delegate**: an active `department_admin` role scoped to Library & Information.
- **Rita the roster member**: a verified profile, an `active` `departmentMemberships` row for Library & Information, and no role at all.
- **Vic the visitor**: signed in, profile not verified, no roster row anywhere.

Also keep a System Admin, and a verified Finance roster member (to prove the roster role does not leak to a department outside `ROSTER_PORTAL_DEPARTMENTS`).

Push the schema first (`pnpm convex`), then seed departments if your deployment is fresh
(`pnpm exec convex run seed:departments`). You need a preview APK built after `expo-audio` lands, or the audio steps cannot be run at all.

## Commands

- [ ] `pnpm --filter @klt-cyber/shared test` → passes, including the `library.ts` caps, unions and the `formatUgx` parity test against `formatCostAmount(amount, "UGX")` → AC-31
- [ ] `npx vitest run --config convex/vitest.config.ts` → passes, including the new `library.test.ts`: a Library roster member holds `manageLibrary` and nothing else, a Finance roster member resolves to no role, an unverified Library roster member resolves to no role, `departmentCapabilities(role)` called with no department name reads `manageLibrary` as false, the insufficient stock guard refuses, the format immutability rule refuses, and the N43 latch fires exactly twice across 12 → 8 → 6 → 14 → 9 → AC-1, AC-2, AC-8, AC-24, AC-26, AC-32
- [ ] `npx vitest run --config convex/vitest.config.ts convex/departmentShell.test.ts` → the five existing `departmentCapabilities("…")` calls still compile and pass unchanged, which is the point of the optional second argument → AC-2
- [ ] `npx tsc -p convex/tsconfig.json --noEmit` → no output
- [ ] `pnpm --filter admin build` → compiles, and the route list includes `/areas-of-service/[slug]/{catalogue,free-content,stock}` → AC-5
- [ ] `pnpm --filter mobile lint` → passes
- [ ] In the Convex dashboard, `libraryCategories`, `libraryItems` and `libraryStockMovements` exist with the indexes the spec names, and `departments` carries `contactPhone` → AC-6, AC-22, AC-23, AC-29
- [ ] `npx convex run` each library QUERY with no session → every one exits 0 and returns null, never throwing → AC-13
- [ ] `npx convex run` each library MUTATION with no session → every one exits 1, so the write path fails closed where the read path fails open → AC-2

## Authority

- [ ] As Rita, open `/areas-of-service` → the Library card is offered and opening it lands on the Library Dashboard, not a bounce back to the hub → AC-3
- [ ] As Rita, the sidebar shows Dashboard, Catalogue, Free content, Stock and Settings, and shows no Roster, Activities or Messages → AC-2, AC-5
- [ ] As Rita, the Dashboard shows the four Library cards and no member count, no claims waiting and no activity feed → AC-4
- [ ] As Rita, call `confirmClaim`, `sendMessage`, `addMember` and `updateContactPhone` directly through `npx convex run` → each exits 1 → AC-2, AC-29
- [ ] As Lydia, the Dashboard shows both the spec 0012 cards and the four Library cards → AC-4, AC-28
- [ ] As the verified Finance roster member, open `/areas-of-service/finance/catalogue` → not found, and the Finance sidebar shows no Library entries → AC-1, AC-5
- [ ] Mark Rita's profile not verified, reload → she is turned away from the Library portal entirely → AC-1
- [ ] As Lydia, open `/areas-of-service/media/catalogue` → not found, since `manageLibrary` is Library only → AC-2

## Catalogue authoring

- [ ] As Rita, create a book: title, description, category, author, cover, `physical`, price 25000, starting quantity 30 → it appears in the Catalogue list and the Stock page shows 30 → AC-6, AC-22
- [ ] Try to create a `merchandise` item with format `pdf` → refused with `LIBRARY_TYPE_FORMAT_MISMATCH` → AC-7
- [ ] Try to create a `physical` item with no price, then with no starting quantity → refused each time, with the matching code → AC-7
- [ ] Try to create a `pdf` item with no file attached → refused with `LIBRARY_FILE_REQUIRED` → AC-7
- [ ] Create a flash disk package with three detail lines → the member detail screen renders them under "Contains"; create merchandise with two detail lines → the same screen renders them under "Variants" → AC-6
- [ ] Edit the book and replace its cover → the previous object is gone from R2 and the new cover renders → AC-8
- [ ] Hide the book → it leaves the mobile Library screen and stays in the Catalogue list marked "Hidden" → AC-9
- [ ] Remove the book → the row stays, its stock movements still list, `coverImageUrl` and `fileKey` are cleared, and the R2 objects are gone → AC-9
- [ ] Check `activityLogs` after each of the five actions above → one entry each, every one carrying `departmentId` for Library → AC-10

## Categories

- [ ] As Rita, add a category → it lands last in the order; rename it, reorder it and hide it → each takes effect on the member filter chips → AC-11, AC-12
- [ ] Add a category whose name differs from an existing one only in case → refused with `LIBRARY_CATEGORY_DUPLICATE`; try the same through rename → refused too → AC-11
- [ ] Reorder three categories → their `order` values come out contiguous from zero with no duplicates → AC-11
- [ ] Delete a category with 12 live items → refused, and the message names 12 → AC-11
- [ ] Delete an empty category → succeeds; remove the last item from another category, then delete it → also succeeds → AC-11
- [ ] Hide every category → the member chip row renders its own empty state rather than a bare strip → AC-12
- [ ] Hide a category that has items → the chip disappears from the mobile screen and from the new item form, and those items still show the category name on their cards → AC-12

## Member browse

- [ ] As Vic, open More → Library → the Library screen opens, listing visible items newest first with cover, title, author and category → AC-13, AC-30
- [ ] Sign out and call `listCatalogue` → nothing comes back → AC-13
- [ ] Search a title fragment in the wrong case, then an author fragment → both match; add a category chip, an `itemType` chip and the Physical segment → all of them narrow together rather than replacing each other; search something absent → an empty state, not a blank screen → AC-14
- [ ] Switch the segment to Free → only digital items, each marked "Free" with no price and no desk line → AC-14, AC-19
- [ ] Throttle the connection so the first load fails → the Library screen shows the error state with a working retry, not a permanent skeleton → AC-13
- [ ] Open a priced item as a member → no stock number anywhere, only "Out of stock" when it is zero → AC-16
- [ ] Open `/library?id=not-a-real-id` → "no longer available", no thrown argument validation error → AC-17
- [ ] With `departments.contactPhone` set, open a priced item → `USh 25,000`, "Available at the Library desk", and both the WhatsApp and call buttons work on a real device → AC-15
- [ ] Clear `contactPhone`, reload → the price and desk line still show, both buttons are gone, nothing is greyed out or broken → AC-15
- [ ] Take an item to zero stock → "Out of stock" shows on both the card and the detail screen, and the contact buttons remain → AC-16
- [ ] Open a deep link to an item, then remove it in the portal and reopen the link → "no longer available", no crash; repeat with a hidden item → AC-17

## Free content

- [ ] As Rita, upload a 4 MB teaching PDF with title, description, category, author and cover → it appears on Free content and on the mobile screen marked "Free", with no price and no desk line → AC-18, AC-19
- [ ] Try a 30 MB file → refused in the form → AC-18
- [ ] Upload a 30 MB object to R2 directly, then call `createItem` claiming `fileSizeBytes` of 2000000 → refused with `LIBRARY_FILE_TOO_LARGE`, because the mutation reads the real size back from R2 → AC-18
- [ ] Try a `.docx` → refused in the form, and refused again by the mutation on its content type → AC-18
- [ ] Try a 9 MB cover image → refused with the cover cap, separately from the file cap → AC-18
- [ ] Edit a free item and replace its MP3 with a different one → `fileSizeBytes` and `fileContentType` are re read rather than carried over, and the old object is gone from R2 → AC-8
- [ ] Try to edit a priced physical book into a `pdf` → refused with `LIBRARY_FORMAT_IMMUTABLE`, price and count untouched → AC-8
- [ ] As Vic, tap the PDF → it opens in the in app browser sheet and renders → AC-20
- [ ] Upload an MP3, tap it as Vic → it plays in the in app player; play and pause work, the progress bar advances, and elapsed and total time render in the mono face → AC-20
- [ ] Navigate away mid playback → audio stops; return and leave the screen → no audio continues in the background and nothing leaks → AC-20
- [ ] While audio is playing, have a second operator edit that item's description in the portal → the item query reruns, the URL does not change and playback does not restart → AC-21
- [ ] Open an item whose `fileKey` points at a missing object → "could not open this file, try again", no crash; watch the player's buffering state on a slow connection → AC-20
- [ ] Confirm there is no download or share action anywhere on a free item, that the URL comes from `getItemFileUrl` and not from the item query, and that no signed URL is stored on the document or held in client state between opens → AC-21
- [ ] Hide a free item, then call `getItemFileUrl` for it directly → refused, so the Library path fails closed on its own rather than relying on the generic key resolver → AC-21

## Stock

- [ ] As Rita, record `out` 5 with a note against a count of 30 → the count reads 25, the movement lists with direction, quantity, resulting count, note and Rita's name → AC-23, AC-25
- [ ] Record `in` 10 → the count reads 35 → AC-23
- [ ] Record `out` 100 against 35 → refused with `LIBRARY_STOCK_INSUFFICIENT`, the count stays 35 → AC-24
- [ ] Record `out` 0, then `out` 2.5 → both refused with `LIBRARY_STOCK_QUANTITY_INVALID` → AC-23
- [ ] Try a movement against a `pdf` item → refused with `LIBRARY_STOCK_NOT_PHYSICAL` → AC-23
- [ ] Delete the account of someone who recorded a movement → the `users` row is anonymised rather than removed (`convex/accountDeletion.ts`), so `actorUserId` still resolves and the row reads "a former member", not blank and not an error → AC-25
- [ ] Record 60 movements against one item → the list shows 50 newest with a working "load more", and two movements saved in the same millisecond keep a stable order across reloads → AC-25
- [ ] Remove an item, then try to hide it, edit it and record a movement against it → all three refused with `LIBRARY_ITEM_NOT_FOUND`; repeat on a hidden item → all three succeed → AC-9, AC-23
- [ ] Walk a count 12 → 8 → 6 → 14 → 9 → Lydia, Dan and Rita each get exactly two push notices and two portal bell entries, at the 8 and at the 9 → AC-26
- [ ] Take a count from 6 to 0 while already stamped → no further notice goes out → AC-26
- [ ] Create a new physical item with a starting quantity of 4 → one N43 goes out at creation → AC-27
- [ ] Confirm an unverified roster member receives no N43, that Rita gets the notice for a movement she recorded herself, and that an HOD who is also on the roster receives exactly one copy rather than two → AC-26

## Dashboard and settings

- [ ] As Rita, the four Library cards read correctly: total items excludes removed ones and includes hidden ones, the low stock count matches the **physical** items at or below 10, recent additions lists the five newest that are neither hidden nor removed, free highlights lists the four newest free items → AC-28
- [ ] With ten free PDFs in the catalogue and no low physical item, the low stock card reads 0, not 10 → AC-28
- [ ] Empty the catalogue entirely → every card renders its own empty state rather than a zero in a blank box → AC-28
- [ ] Force one card's query to throw (ask the Convex function to reject on a seeded flag, or point it at a missing index in a scratch deployment) → that card shows the shared `ErrorState` with a retry while the rest of the page stays alive. Do not test this by stopping `pnpm convex`, which drops the whole websocket and proves nothing about one card → AC-28
- [ ] As Lydia, set `contactPhone` on Settings → it saves immediately, writes one `activityLogs` entry, and the member contact buttons appear; save again unchanged → no second entry → AC-29
- [ ] As Dan and then as Rita, call `updateContactPhone` directly → refused both times → AC-29
- [ ] Enter `0771 234 567`, then `not a number` → the first normalises to E.164 or is refused with guidance, the second is refused with `DEPARTMENT_CONTACT_PHONE_INVALID`; save `+256771234567` → `tel:` dials it as stored and `wa.me` uses it without the `+` → AC-15, AC-29
- [ ] Save an empty value → the field clears and the member contact buttons disappear → AC-29

## Found during the build

_Appended by `/develop` on 2026-11-01. Two of these cover places the
implementation went further than the spec text; the rest are one step per row
of the spec's **Value sourcing** table, aimed at the edge that breaks if a
value is taken from the wrong place._

### Where the build went further than the spec

- [ ] As Rita, call `departmentShell:getDashboard` and `departmentShell:listDepartmentFeed` **directly**, not through the portal → both return null. Hiding the cards without closing the queries would still have handed a roster member the department's member counts and claim numbers through the API, so these two were narrowed from "any shell role" to `viewRoster` → AC-4
- [ ] Give Media an active HOD, then take a Library item from 11 to 10 → Media's HOD is **not** notified. The spec named `resolveRoleAudience`, which carries no department and would have told all thirteen departments' heads; the recipient set is read department-scoped instead → AC-26
- [ ] Make one person both Library's HOD **and** a verified Library roster member, then trigger N43 → they receive exactly one notice, not two (the union is deduplicated by user id and sent as a `users` audience) → AC-26
- [ ] Sign in as someone holding an unrelated active role (a clan elder) with an **unverified** profile who is also on Media's active roster → the Media tile on the Areas of Service hub has no link, and the switcher does not list it. `hasPortalAccess` lets them to the hub on the strength of the role, but the shell would turn them around, so the door is not offered → AC-3
- [ ] As Lydia, add a catalogue item → the dashboard's "Recent activity" card names it ("… added something to the catalogue: <title>"). The department feed's action list was widened to include `LIBRARY_FEED_ACTIONS`, or Library's feed would have shown roster changes and nothing about the work the department actually does → AC-10

### One step per Value-sourcing row

- [ ] Price a physical item at 25000 → the phone renders `USh 25,000`, and the same figure in the System Admin cost register renders identically. Change the price to 0, then to 100000000 → `USh 0` and `USh 100,000,000`, both grouped the same way whatever locale the browser or phone reports → AC-31
- [ ] Upload a ~40 MB PDF to R2, then have the client call `createItem` claiming `fileSizeBytes: 2000000` → refused with `LIBRARY_FILE_TOO_LARGE`. The stored size on a legitimate upload is R2's figure, not the client's: upload a 4 MB file, claim 1 MB, and check the item's `fileSizeBytes` reads ~4 MB → AC-18
- [ ] Rename an MP3 to `.pdf` and upload it against the `pdf` format → refused with `LIBRARY_FILE_TYPE_UNSUPPORTED`, because the check is against the content type R2 reports and not the file name → AC-18
- [ ] Replace a digital item's file with a differently sized one → `fileSizeBytes` changes to the new file's real size rather than carrying the old figure over, and the old object is scheduled for deletion → AC-8
- [ ] Give an item a cover that is an absolute `https://` URL (a seeded Unsplash image), then remove the item → the removal succeeds and no R2 delete is attempted for it, because `toR2Key` resolves an absolute URL to null. Repeat with an R2-key cover → that object **is** scheduled for deletion → AC-9
- [ ] Inspect the `listCatalogue` payload in the network tab → no row carries `contactPhone`, `quantityOnHand`, `fileKey` or `createdBy`. Open one item → `getCatalogueItem` is the only response carrying `contactPhone` → AC-15, AC-16
- [ ] Set a physical item's count to exactly 1, then 0 → the card and the detail screen flip to "Out of stock" at 0 only, and at no point is the number 1 or 0 shown to the member → AC-16
- [ ] Create two items in the same millisecond (a seed inserting a batch is the easy way) → reload the Library screen several times and the two keep the same order every time, because `createdAt` ties are broken by `_id` descending → AC-13
- [ ] Upload an audio item **without** typing a length, and play it → the total time shows `--:--` until the file loads and then the file's own duration, so nothing depends on `audioDurationSeconds` being filled. Then type a length on a second item → that figure shows before the file loads → AC-20
- [ ] Start playing a free recording, then edit that item's description in the portal so the member's item query re-runs → playback does not restart and the audio does not cut out. The URL comes from the one-shot `getItemFileUrl` action, so a reactive rerun cannot re-sign it underneath the player → AC-21
- [ ] Hide a digital item while its PDF sheet is open, then tap to open it again → `getItemFileUrl` returns null and the screen says it could not open the file, because the action re-checks visibility itself rather than trusting the generic resolver → AC-21
- [ ] Create a physical item with a starting quantity of 30 → its movement history already holds one `in` of 30 labelled "Starting quantity", and the count never moved without a movement behind it → AC-22
- [ ] Record an `out` of 5 against a count of 30, then read the movement row → `quantityAfter` is 25 and the item's `quantityOnHand` is 25; they are written in one transaction, so no sequence of reads finds them disagreeing → AC-23
- [ ] Anonymise the account of someone who recorded a movement (run account deletion), then reopen that item's Stock page → the row renders "a former member" rather than a blank cell, and the page does not error → AC-25
- [ ] As Lydia, delete a category carrying 12 live items → refused, and the message names 12. Remove all 12 items, then delete it again → it goes → AC-11

### The Android PDF question (deliberately open)

_Spec 0015 AC-20 decided an in-app browser sheet for PDFs. On iOS that is a
Safari view, which renders a PDF. On Android it is a Chrome Custom Tab, which
has historically handed a PDF to the download manager instead — and where it
does, the member leaves the app and a signed-URL PDF lands in their Downloads,
which is exactly what AC-21's "no download" rule exists to prevent. Recent
Chrome has an inline Android PDF viewer, so it may be fine on a current
device, but it is version dependent and the Custom Tabs provider is not always
Chrome. Nobody has tested this: the preview APK has not been cut. Run these
two steps off that build before trusting AC-20 on Android._

- [ ] On a real **Android** phone, from the preview APK, tap a free PDF → it renders inside the app and you can scroll and pinch it. If it instead downloads the file, hands it to an external viewer, or leaves the app, AC-20 is not satisfied on Android and a real in-app renderer is needed — that is an `/architect` decision and a second native build → AC-20, AC-21
- [ ] Repeat on a device whose default browser is **not** Chrome (Samsung Internet is the common case) → same expectation. A Custom Tabs provider that is not Chrome is the likeliest place this falls back to a download → AC-20
- [ ] On **iOS**, tap a free PDF → it renders in the Safari sheet, and there is no share or download affordance you added (the system sheet's own chrome is not ours to remove) → AC-20, AC-21

## Page one covers and PDF preview (spec 0016)

_Spec [0016](../0016-library-pdf-preview-and-page-one-covers/index.md) was ratified on
2026-11-01 and is no longer `Assumed`. These steps REPLACE the earlier set,
which described page one only and a planned `react-pdf` viewer: the viewer was
rejected on ratification because rendering means fetching bytes, which is cross
origin and needs the bucket's GET rule, where the iframe preview does not. The
iframe is kept. 0016 adds a second source for a PDF item's cover, which spec
0015's own **Value sourcing** table should gain a line for._

_**Now superseded by spec 0016's own
[verify.md](../0016-library-pdf-preview-and-page-one-covers/verify.md)**, written
when the build landed: same acceptance criteria, but with the PDFs you need
named, the command steps the implementation made possible (the two build
refusals, the deleted font assets, the `getDocument` grep) and the stripped CORS
proof its task 7 asks for. Run that list. These steps are kept because they are
still correct, and prose written at ratification is not `/develop`'s to delete;
prune them whenever you would rather have one list._

### The cover offer

- [ ] As Lydia, attach a PDF whose first page IS the book's cover → three thumbnails appear, labelled with their page numbers, none preselected. Tap the first, save → the cover field fills and the mobile Library card shows that cover rather than a gradient → 0016 AC-1, AC-2, AC-9
- [ ] Attach a PDF that opens on a blank leaf or a half title → tap the page two or three thumbnail and get the real cover. This is the case page one alone silently got wrong → 0016 AC-1, AC-4
- [ ] Attach a PDF and ignore the offer entirely → the item saves with exactly the cover it had before, which for a new item is none. Nothing was applied behind your back → 0016 AC-3
- [ ] Attach a one page PDF → exactly one thumbnail, no error about the missing pages two and three → 0016 AC-4
- [ ] Attach a password protected or deliberately corrupted PDF → the FILE still attaches and saves; the offer is simply absent and no error interrupts anything → 0016 AC-5
- [ ] Attach a PDF where one middle page fails to render but its neighbours do → the offer shows the pages that rendered, labelled with their REAL page numbers, and omits the bad one. One bad page must never suppress a good one → 0016 AC-6
- [ ] Open an existing PDF item for editing WITHOUT touching its file → no offer appears, because the offer reads the local file and there is none in hand. Then replace the file → the offer arms, worded as a replacement because a cover already exists → 0016 AC-7
- [ ] Inspect a generated cover: 600 pixels wide, JPEG, on a white background (check a PDF with a transparent page: the artwork must not sit on black), and well under 500 KB → 0016 AC-8
- [ ] Check the stored value → an ordinary R2 key, indistinguishable from a hand uploaded cover, and `resolveMediaUrl` serves it to both apps → 0016 AC-9
- [ ] Adopt page one, then adopt page three, then pick a cover by hand, then save → the item keeps the hand picked one, and the superseded generated objects are accounted for rather than silently multiplying → 0016 AC-10
- [ ] Adopt a cover over an existing one and save → the old object is scheduled for deletion exactly as a hand picked replacement is → 0016 AC-10, 0015 AC-8

### Correct rendering, and not failing quietly

- [ ] Attach a PDF that uses a non embedded font, and one with CJK text → the thumbnails show readable glyphs. A blank thumbnail adopted in good faith is worse than no offer, so this is the step that catches a missing character map or standard font asset → 0016 AC-11
- [ ] Confirm script evaluation is off on every parse, set through the one shared options object rather than per call site. `pdf.js` takes this per document, so a second call site that omits it reintroduces the risk CVE-2024-4367 turned on → 0016 AC-12
- [ ] Run the dependency check: exactly one `pdfjs-dist`, at the pinned version, with no duplicate hoisted in. The render call this code uses belongs to version 6 and breaks against a quietly resolved version 4 → 0016 AC-13
- [ ] Mount the offer, unmount and remount immediately (React's development double mount does this for you) → no worker error reaches the operator and the live mount still renders → 0016 AC-14
- [ ] Attach several large PDFs in one sitting → browser memory does not climb with each, because every parsed document is torn down and every thumbnail's object URL is released, including the pages you did not adopt → 0016 AC-15

### The preview

- [ ] Open a PDF item and press Preview, from inside the edit dialog AND from the row on the Catalogue and Free content tables → the PDF opens inline in the portal and nothing downloads → 0016 AC-16
- [ ] Check a REMOVED PDF item's row → no Preview action, because spec 0015's removal clears `fileKey`. `format === "pdf"` alone is not a sufficient predicate → 0016 AC-16
- [ ] Set the browser to download PDFs rather than open them, then press Preview → either the inline content disposition override holds it open, or the interface says plainly that a browser setting may download it. It must not look like a failure → 0016 AC-17

### The property that is easy to lose later

- [ ] Strip every GET origin rule from the dev bucket's CORS policy (`infra/r2-cors.json`), keeping only what uploads need, then redo the cover offer steps above → the offer still works end to end, because it reads the local file and never fetches. Note that the PREVIEW is not covered by this claim: it is configuration free for a different reason (a document load is not governed by CORS at all) → 0016 AC-18
- [ ] Watch the network tab while attaching a PDF → the only requests are the R2 PUTs and `syncMetadata`. No PDF bytes go anywhere but the bucket, and no new Convex function is in the path → 0016 AC-19
