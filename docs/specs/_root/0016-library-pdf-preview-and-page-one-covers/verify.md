# Verify: Library page one covers and PDF preview · spec 0016 · updated 2026-11-02
_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Before you start

You need one account and a small shelf of PDFs. The account is **Rita the roster
member** from spec 0015's `verify.md`: a verified profile, an `active`
`departmentMemberships` row for Library & Information, and no role at all. She
is the one who proves this works for the people who will actually use it.

The PDFs are the real work, and they are worth collecting once and keeping:

- **cover-first.pdf** — a scanned book whose page one IS the cover.
- **blank-leaf.pdf** — a book that opens on a blank leaf or a half title, with
  the real cover on page two or three.
- **one-page.pdf** — exactly one page.
- **locked.pdf** — password protected (any PDF tool will add one).
- **broken-page.pdf** — pages one and three render, page two does not. A page
  with a deliberately corrupted image stream or font object does it; if you
  cannot make one, say so rather than ticking AC-6 on a guess.
- **cjk.pdf** — text in a non embedded CJK font. Exporting a page of Chinese or
  Japanese text without embedding fonts is enough.
- **transparent.pdf** — a page with a transparent background, to prove the
  white fill.

Three pages of offer appear under the file field on both the Catalogue and the
Free content forms, so every step below works from either page.

## UI / manual

### The cover offer

- [ ] Attach `cover-first.pdf` on the Catalogue form → three thumbnails appear, labelled Page 1, Page 2, Page 3, with none highlighted and a "Use as the cover" button beside them → AC-1
- [ ] Choose Page 1, press "Use as the cover", save the item → the item's cover is that page, and the mobile Library card shows it instead of a gradient placeholder → AC-2, AC-9
- [ ] Attach `blank-leaf.pdf`, choose the thumbnail that is the real cover, adopt and save → that page is the cover → AC-1, AC-4
- [ ] Attach `cover-first.pdf`, adopt nothing, save → a NEW item saves with no cover at all; an EXISTING item keeps exactly the cover it had → AC-3
- [ ] Attach `cover-first.pdf`, then use the Cover image field below to upload a picture by hand → the hand picked one is what saves, and the field is never disabled by the offer → AC-2
- [ ] Attach `one-page.pdf` → exactly one thumbnail, labelled Page 1, no error anywhere → AC-4
- [ ] Attach `locked.pdf` → the file still attaches, the item still saves, NO offer appears, and no error interrupts the save → AC-5
- [ ] Attach `broken-page.pdf` → two thumbnails, labelled Page 1 and Page 3, and the gap is silent. A label still names the real page → AC-6
- [ ] Open an existing PDF item for editing and do not touch its file → no offer is shown → AC-7
- [ ] Open an item that ALREADY has a cover and replace its PDF → the offer's wording says to use a page "instead of the cover already set", not as a first cover → AC-7
- [ ] Attach `cjk.pdf` → the thumbnail shows readable glyphs, not a blank page and not boxes → AC-11
- [ ] Attach `transparent.pdf`, adopt a page, then open the stored cover object → white behind the artwork, not black, and the image is 600 pixels wide and a JPEG → AC-8
- [ ] Adopt Page 1, then choose Page 3 and press "Use this one instead", then save → the item has Page 3's cover. Page 1's object is a known orphan until the deferred sweep exists → AC-10
- [ ] Block the cover's PUT (go offline, or block the R2 host in devtools) and press "Use as the cover" → the operator is told the cover did not upload, the PDF STAYS attached, and the item keeps its previous cover → AC-3, AC-10
- [ ] Adopt a cover over an item that already had one and save → the old object is scheduled for deletion exactly as a hand picked replacement is (check `activityLogs` and the bucket) → AC-10
- [ ] Attach four large PDFs in one sitting, watching the browser's memory between each → it does not climb per PDF, because every thumbnail's object URL is released including the ones nobody adopted → AC-15
- [ ] In `pnpm admin` (React development double mount), attach a PDF, close the dialog, reopen it and attach again → no worker error reaches the operator and the live mount still renders its thumbnails → AC-14
- [ ] Watch the network panel for the whole offer, from attach to adopted → the only requests are the upload gateway's own; nothing GETs from the bucket and no PDF content leaves the machine → AC-18, AC-19

### The preview

- [ ] Press Preview on a PDF row in the Catalogue table → a sheet opens from the right at the FULL height of the window, and the browser's own viewer shows the file in it. Nothing downloads → AC-16, AC-17
- [ ] Judge the reading area: a whole portrait page should be legible at the viewer's own fit-to-page zoom, without horizontal scrolling, and the table should still be visible beside the sheet → AC-16
- [ ] Press Preview on a PDF row in the Free content table, and on the file field inside that item's edit dialog → both open the same sheet on the same file. From inside the edit dialog the sheet layers over it, and Escape closes the sheet first rather than the form underneath → AC-16
- [ ] Press "New tab" in the sheet header → the same PDF opens as a top level document in the browser's own full viewer. Middle click and Cmd or Ctrl click behave as links too, because it is an anchor → AC-16, AC-17
- [ ] Remove an item, then look at its row → no Preview action, because `removeItem` cleared its `fileKey` → AC-16
- [ ] Look at an audio row and a physical item row → no Preview action on either → AC-16
- [ ] Close the sheet and inspect the item document and client state → no signed URL is persisted anywhere, and reopening re-resolves it → AC-16, AC-17
- [ ] Read the line under the title → it names the browser's own PDF setting as the reason a download could happen and points at the New tab action, rather than the preview appearing to fail → AC-17
- [ ] Narrow the window to a laptop width and to phone width → the sheet stays usable (it takes 94% of the width), the title truncates rather than wrapping under the close button, and the frame still fills the height → AC-16

### The item form's shape

_Not an acceptance criterion of either spec: a layout change made to spec
0015's item form while building this one, because the cover offer is the
tallest thing in it and the single column it landed in could not hold it. The
form's fields, its validation and the mutations it calls are unchanged, so
these steps are about shape rather than behaviour._

- [ ] Open any item for editing → the title, the tabs and the Cancel and Save buttons all stay put, and only the panel between them scrolls. The old form scrolled its own Save button out of sight
- [ ] Look at the Details tab → the short fields sit in two columns, and the description and detail lines run the full width
- [ ] Attach a PDF on the File and cover tab → the offer and the Cover image field are both on that tab, so adopting a page changes a field you can see
- [ ] Clear the title, switch to the File and cover tab, then press Save → the form switches back to Details and tells you there. A refusal must never point at a field on a tab you are not looking at
- [ ] On a digital item, remove the file and press Save → the form switches to File and cover and asks for the upload
- [ ] Make a panel overflow (a long description, or the offer with three thumbnails) → the scrollbar is the slim tonal one, not the chunky OS bar with arrows
- [ ] Open Categories from the Catalogue page → the add row and the note below stay put, only the list scrolls, and a short list does not open a tall empty dialog
- [ ] Spot check a few dialogs outside the Library (an Event, an Announcement, the Weekly Program, a roster sheet) → where they overflow, the bar is the slim tonal one. This was a portal wide sweep of the same one class, so it is worth a glance even though it is not the Library's

### Authority

- [ ] As Rita (roster member, `manageLibrary` and nothing else) → she can attach a PDF, adopt a cover and preview a file end to end → AC-19, and spec 0015's AC-5
- [ ] As a Finance roster member → the Catalogue and Free content pages cannot be reached at all, so neither can this → AC-19, and spec 0015's AC-5

## Commands

- [ ] `node apps/admin/scripts/pdfjs-assets.mjs` → stages the pinned `pdfjs-dist` worker, cmaps and standard fonts into `apps/admin/public/pdfjs`, and says so → AC-11
- [ ] `pnpm --filter admin build` → compiles, having run the same check and staging first → AC-11, AC-13
- [ ] Change `pdfjs-dist` in `apps/admin/package.json` to `^6.4.299` and run `pnpm --filter admin build` → the build REFUSES and names the pin. Put it back → AC-13
- [ ] Create a second copy by hand (`node_modules/recharts/node_modules/pdfjs-dist/package.json` with a different version) and run `pnpm --filter admin build` → the build REFUSES and lists both paths with their versions. Delete it again → AC-13
- [ ] `rm -rf apps/admin/public/pdfjs/standard_fonts` (do NOT re-run the script), then attach `cjk.pdf` in `pnpm admin` → the glyphs come out blank or boxed, which is what proves the assets are doing the work. Re-run the script to restore → AC-11
- [ ] `grep -rn "getDocument" apps/admin` → exactly one call site, in `components/library/pdfCoverPages.ts`, spreading the shared `PARSE_OPTIONS`. Any second call site is the AC-12 failure this is guarding against → AC-12
- [ ] Strip every `GET` origin rule from the DEV bucket's CORS policy, leaving only what uploads need, then adopt a cover end to end → it still works, start to finish. Restore the policy afterwards (`infra/r2-cors.json`, `spec/STORAGE.md` §3). This is spec 0016's task 7 and the one property most easily lost later → AC-18

## Acceptance-criteria coverage

- AC-1 · covered by the three thumbnails step, the none-highlighted check and the blank-leaf step
- AC-2 · covered by the adopt-and-save step and the hand picked cover precedence step
- AC-3 · covered by the adopt-nothing step and the blocked PUT step
- AC-4 · covered by the one-page step and the blank-leaf step
- AC-5 · covered by the `locked.pdf` step
- AC-6 · covered by the `broken-page.pdf` step
- AC-7 · covered by the untouched-file step and the already-has-a-cover wording step
- AC-8 · covered by the `transparent.pdf` step (white fill, 600 pixels, JPEG)
- AC-9 · covered by the adopt-and-save step, where the mobile card resolves the stored key like any cover
- AC-10 · covered by the adopt-twice step, the blocked PUT step and the replacement cleanup step
- AC-11 · covered by the `cjk.pdf` step, and by deleting `standard_fonts` to prove the negative
- AC-12 · covered by the `getDocument` grep
- AC-13 · covered by the unpinned-range refusal and the duplicate-copy refusal
- AC-14 · covered by the development double mount step
- AC-15 · covered by the four-large-PDFs memory step
- AC-16 · covered by the row Preview steps, the removed item step, the non-PDF rows step and the no-persisted-URL step
- AC-17 · covered by the no-download step and the sentence-under-the-frame step
- AC-18 · covered by the network panel step and the stripped CORS policy step
- AC-19 · covered by the network panel step and both authority steps

## Value sourcing

One step per row of spec 0016's **Value sourcing** table, so each value's real
source is exercised rather than assumed:

- each page thumbnail ← the local `File`, never R2 · the network panel step and the stripped CORS step
- how many thumbnails ← `min(3, numPages)` minus failures · the one-page and `broken-page.pdf` steps
- each thumbnail's label ← the page's own one based number · `broken-page.pdf` showing Page 1 and Page 3
- pixel width and encoding ← 600 pixels, white fill, JPEG `0.9` · the `transparent.pdf` step
- glyphs on an unembedded font page ← the cmap and standard font assets · the `cjk.pdf` step, and deleting `standard_fonts` for the negative
- `coverImageUrl` ← the R2 key from `generateUploadUrl` · the adopt-and-save step, confirming a plain key is stored and not a URL
- the cover's content type ← `image/jpeg` from the encoder · the adopt-and-save step passing `assertCoverWithinLimits`'s image type check
- the cover's size as the server sees it ← read back from R2 by spec 0015's check · the same step; the client never claims a size
- the object deleted on replacement ← `scheduleReplacedMediaCleanupMany` · the replacement cleanup step
- a superseded generated cover before save ← nothing, a known orphan · the adopt-twice step
- whether script evaluation is enabled ← one shared options object · the `getDocument` grep
- which `pdf.js` build runs ← the pinned, unduplicated copy · the two build refusal steps
- the preview's URL ← `uploads.getFileUrl` on `fileKey`, never persisted · the no-persisted-URL step
- whether a row offers Preview ← `format === "pdf"` and `fileKey` present · the removed item and non-PDF rows steps
