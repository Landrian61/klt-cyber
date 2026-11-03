# 0016. Library page one covers and PDF preview

**Date**: 2026-11-01
**Status**: In Progress

## Summary

A PDF the Library team uploads now offers its first three pages as thumbnails, so they can adopt the book's own cover in one tap instead of hunting down the same picture and uploading it twice. The rendering happens entirely in the operator's browser using `pdf.js` (the library every browser's own PDF viewer is built on), reading the file they just picked before it is uploaded, so no PDF content leaves their machine and no storage configuration can break it. The cover that comes out is an ordinary storage key, indistinguishable from one somebody picked by hand.

The portal keeps the browser's own PDF viewer for previewing an attached file, reached from the item rows as well as the edit form. This spec ratifies a decision `/develop` recorded as an assumption while building spec 0015. The assumption held for the covers; a plan to replace the preview with our own viewer was deliberated here and rejected, for reasons in the Rationale.

## Requirements

**User stories**:
- As a Library operator, I want to use a book's own cover page as its cover image, so the catalogue does not show a placeholder for a book whose cover is inside the file.
- As a Library operator, I want to be shown the first few pages rather than only the first, because plenty of books open on a blank leaf or a half title before the real cover.
- As a Library operator, I want a PDF that will not open to leave my upload alone, so a problem with a picture never costs me the item.
- As a Library operator, I want to read an attached PDF from the item list, so confirming I published the right teaching does not mean opening an edit form I then cancel out of.

**Acceptance criteria** (the contract, each independently checkable):

The cover offer
- **AC-1**: after an operator attaches or replaces a PDF on the Catalogue or Free content form, the first three pages are rendered as thumbnails beside an action that adopts the chosen one as the item's cover. Each thumbnail is labelled with its page number, and none is preselected.
- **AC-2**: adopting a thumbnail uploads that image through the existing `uploads` gateway and fills the item's cover field with the returned key. The manual cover upload control remains available and takes precedence over an adopted cover.
- **AC-3**: the offer never applies itself. An operator who ignores it saves an item with exactly the cover it had before, which for a new item means none at all.
- **AC-4**: a PDF with fewer than three pages offers the pages it has. A one page PDF offers one thumbnail.
- **AC-5**: a PDF whose pages cannot be rendered at all (encrypted, corrupt, or built in a way this `pdf.js` will not open) leaves the upload unaffected: the file still attaches, the offer is absent, and no error interrupts the save.
- **AC-6**: when some pages render and others do not, the offer shows the ones that rendered, labelled with their real page numbers, and silently omits the rest. One bad page never suppresses a good one.
- **AC-7**: the offer is armed by attaching or replacing a file, and only then. Opening an existing item for editing without touching its file shows no offer, because the offer reads the local file and there is none in hand. When the item already has a cover, an armed offer is worded as a replacement rather than as a first cover.
- **AC-8**: a thumbnail is produced by rasterising the rendered page (drawing it as a viewer would) onto a white background at 600 pixels wide, encoded as JPEG at quality `0.9`. White is filled first because a PDF page may be transparent and JPEG carries no alpha channel. Typical output is well under 500 KB, far below the cover cap.
- **AC-9**: the stored value is an ordinary R2 object key. `resolveMediaUrl`, `toR2Key` and every member surface treat it exactly as a hand uploaded cover, and the server side cover checks spec 0015 already enforces (at most `LIBRARY_COVER_MAX_BYTES`, and an image content type) still apply to it unchanged.
- **AC-10**: adopting a cover, then adopting a different page or picking one by hand, leaves at most one unreferenced object per superseded choice, and the item saves with the last one chosen. The rule is stated in the code: a superseded generated cover is an orphan until the deferred sweep exists, and the count is bounded by how many times the operator changed their mind in one form session.

Correct rendering
- **AC-11**: character map and standard font assets are configured, so a PDF whose fonts are not embedded, or which uses CJK text, renders its glyphs rather than producing a blank or garbled thumbnail. A cover that silently comes out empty is worse than no offer.
- **AC-12**: script evaluation is disabled on every `getDocument` call, through one shared options object rather than per call site, so a future caller cannot omit it. This is a per document parameter in `pdf.js`, not a global setting.
- **AC-13**: exactly one `pdfjs-dist` instance and one worker exist in the application, with the version pinned, and a dependency check proves no duplicate copy was hoisted in. The render call signature this code uses belongs to version 6, so a silently resolved version 4 copy would break it.
- **AC-14**: mounting the offer twice in quick succession (which React's development mode does deliberately) never leaves a destroyed parse task in use by the live mount, and never reports a worker error to the operator.
- **AC-15**: every thumbnail's object URL is released when the offer is replaced or the form closes, including the pages the operator did not adopt, so uploading several PDFs in a sitting does not accumulate bitmaps.

The preview
- **AC-16**: an operator can preview an attached PDF without downloading it, reached both from the file field inside the edit dialog and from a Preview action on each row of the Catalogue and Free content tables whose item is a PDF and still has a file. A removed item, whose `fileKey` spec 0015 clears, offers no Preview.
- **AC-17**: the preview relies on the browser's own PDF viewer. Where the signed URL can be made to carry an inline content disposition it does so, and where it cannot the interface says plainly that an unusual browser setting may download the file instead, rather than appearing to fail.

Shared properties
- **AC-18**: the cover offer requires no GET origin rule on the storage bucket. It reads the local file the operator picked, before any upload, so a bucket whose CORS policy is missing or narrowed does not affect it in any environment. This claim is scoped to the cover offer and is not made of the preview, which is a browser document load and needs no such rule for a different reason.
- **AC-19**: no PDF content is sent to any third party, and this spec adds no new Convex function.

## Decision

**Chosen option**: Option 3: derive in the browser from the local file, keep the browser's viewer.

Render the first three pages of a freshly attached PDF in the operator's browser and offer them as cover thumbnails, and keep the browser's own PDF viewer for previewing an attached file, reachable from the item rows as well as the edit form (basis: your `AGENTS.md`, the admin convention that an existing component is reached for before new markup is written).

Three sub choices settled rather than offered, because each is a judgement with a clear answer rather than a preference:

- The page is **rasterised**, not searched for an embedded full page image to extract. One code path that works for every PDF beats two that split on what a given file happens to contain, and the gain would be cosmetic on a thumbnail that renders at card size on a phone.
- The offer applies at **upload time only**, not to PDFs already in the bucket, even though the GET origin rule that would allow it is present in both `infra/r2-cors.json` and `infra/r2-cors-prod.json`. Keeping the everyday path off bucket configuration entirely is worth more than retrofitting a catalogue that is currently near empty (basis: `spec/STORAGE.md`, which makes the CORS policy a manual per environment step).
- The character map and standard font assets are **served from the application's own static assets**, not from a public CDN, matching how this project bundles its fonts rather than fetching them.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) for the offer panel's primitives

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No change. This spec adds no table, no column and no index. It writes to `libraryItems.coverImageUrl`, which spec 0015 already defines as an optional string holding either an R2 object key or an absolute URL, and it writes the same kind of value that field already holds.

**State transitions**:

None on any stored record. The offer holds short lived interface state inside the upload control, persisted nowhere:

`no file` → `uploading` → `attached, offer armed` → `attached, cover adopted` (a thumbnail was tapped) or `attached, offer ignored`. Replacing the file returns to `uploading` and arms a fresh offer. Opening an existing item without touching its file arrives at `attached, no offer`, because there is no local file to read (AC-7). Nothing survives a reload, by design: the offer is about the file in front of the operator right now.

**API surface**:

No new Convex functions. The feature composes three that already exist:

| Function | Kind | Why this feature calls it | Auth |
|---|---|---|---|
| `uploads.generateUploadUrl` | mutation | a key and a signed PUT URL for the adopted cover image | any signed in session |
| `uploads.syncMetadata` | mutation | records the uploaded cover object, without which the server sees a key with no object behind it | any signed in session |
| `uploads.getFileUrl` | query | resolves the attached PDF's key into a signed URL for the preview iframe | any signed in session |
| `library.createItem` / `library.updateItem` | mutation | unchanged; they receive the adopted cover's key in the same `coverImageUrl` argument a hand picked cover uses | `manageLibrary` |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| the cover offer | each page thumbnail | rendered in the browser from the local `File` the operator picked, before any upload; never fetched from R2 (AC-8, AC-18) |
| the cover offer | how many thumbnails to show | `min(3, pdf.numPages)` from the parsed document, minus any page that failed to render (AC-4, AC-6) |
| the cover offer | each thumbnail's label | the page's own one based number as `pdf.js` numbers pages, so a label still matches the book after a failed page is omitted (AC-1, AC-6) |
| the cover offer | the thumbnail's pixel width and encoding | fixed in this spec: 600 pixels wide, white fill, JPEG at quality `0.9` (AC-8) |
| the cover offer | the glyphs on a page whose fonts are not embedded | the character map and standard font data assets served from the application's own static assets, configured on the shared options object (AC-11) |
| adopting a cover | `libraryItems.coverImageUrl` | the R2 key returned by `uploads.generateUploadUrl` for the adopted thumbnail's blob. **This is a second source for a value spec 0015's own value sourcing table lists as operator uploaded only, and ratifying that addition is the point of this spec** (AC-2, AC-9) |
| adopting a cover | the cover's content type | `image/jpeg`, fixed by the encoder, which is what satisfies the image content type check spec 0015's `assertCoverWithinLimits` enforces server side (AC-9) |
| adopting a cover | the cover's size as the server sees it | read back from R2 by spec 0015's existing cover check; never claimed by this client (AC-9) |
| adopting a cover | the object deleted when a cover is replaced on save | spec 0015's existing `scheduleReplacedMediaCleanupMany` on the previous `coverImageUrl`, unchanged and unaware the new value was generated (AC-10) |
| adopting a cover | what happens to a superseded generated cover before save | nothing: it is an orphan until the deferred sweep exists. Bounded by how many times the operator changed their mind in one session, and stated in the code rather than left to a reader to work out (AC-10) |
| every parse | whether script evaluation is enabled | one shared options object in the `pdf.js` module, not a per call site argument (AC-12) |
| every parse | which `pdf.js` build runs | the single pinned `pdfjs-dist` version, proven unduplicated by a dependency check (AC-13) |
| the preview | the PDF's URL | `uploads.getFileUrl` on `libraryItems.fileKey`, handed to an iframe as a document load; held only for the life of the open dialog and never persisted (AC-16, AC-17) |
| the preview | whether a row offers the action at all | `format === "pdf"` **and** `fileKey` present, so a removed item whose key spec 0015 cleared offers nothing (AC-16) |

**Key invariants**:
- A cover is never adopted without an explicit operator action. No code path writes `coverImageUrl` from a render result on its own (AC-3).
- A failure anywhere in parsing or rendering never fails the file upload or the item save. An absent or shorter offer is the only failure mode (AC-5, AC-6).
- A generated cover is indistinguishable from a hand uploaded one once stored. No field records which it was, and nothing downstream branches on the difference (AC-9).
- Exactly one `pdfjs-dist` instance and one worker exist, at one pinned version (AC-13).
- The cover offer issues no cross origin request, so no bucket CORS rule governs it (AC-18).
- No signed URL is persisted, on a document or in client state beyond the open dialog, which is spec 0015's AC-21 rule and still holds here because the preview never re signs under an open document.

**Security model**:
- **Who may do this**: anyone who can already reach the Catalogue or Free content page, which spec 0015 gates on `manageLibrary`. This spec adds no capability and widens none. Attaching a cover key stays authorized inside `createItem` and `updateItem`.
- **Untrusted input**: a PDF is a document format with an execution history, and these are files the Library team obtained from elsewhere. Parsing happens in the operator's browser inside an authenticated session, with script evaluation disabled explicitly on every parse rather than relying on a library default (AC-12).
- **Data egress**: none. The extraction never leaves the machine; the preview is a browser document load from the project's own bucket. No PDF content reaches a third party, and no new server path exists to audit (AC-19).
- **No regulated data.** Book covers and church teachings. Nothing here changes who can read a hidden or removed item.
- **Audit**: unchanged. Adopting a cover is part of the item create or edit that spec 0015 already logs as `library.item_created` or `library.item_updated`. A generated cover needs no entry of its own because it is not a separate consequential act.

**Configuration required**: none. No environment variable, no credential, no bucket change. The GET origin rule present in both CORS files is deliberately not relied on by the cover offer (AC-18).

**Critical test scenarios**:
- Happy path: a scanned book whose page one is its cover; the operator taps the first thumbnail, saves, and the mobile Library card shows that cover instead of a gradient, verifies **AC-1**, **AC-2**, **AC-9**
- Happy path: a book that opens on a blank leaf; the operator taps page two or three and gets the real cover, verifies **AC-1**, **AC-4**
- Failure case: a password protected PDF; the file attaches and saves normally and no offer appears, verifies **AC-5**
- Failure case: a PDF where page two will not render but one and three will; two thumbnails appear, labelled 1 and 3, verifies **AC-6**
- Failure case: a one page PDF offers exactly one thumbnail rather than erroring on the missing pages, verifies **AC-4**
- Failure case: a PDF using a non embedded CJK font renders readable glyphs in the thumbnail rather than a blank page, verifies **AC-11**
- Failure case: the adopted cover's own upload is refused; the item keeps its previous cover, the operator is told, and the PDF stays attached, verifies **AC-3**, **AC-10**
- Failure case: every GET origin rule is stripped from the dev bucket's CORS policy, leaving only what uploads need; the cover offer still works end to end, verifies **AC-18**
- Failure case: the offer is mounted, unmounted and remounted immediately (React development double mount); no worker error reaches the operator and the live mount still renders, verifies **AC-14**
- Auth and permission: a verified Library roster member holding `manageLibrary` and nothing else can use the feature; a Finance roster member cannot reach the page at all, verifies **AC-19** and spec 0015's **AC-5**
- Regression: adopting a cover over an existing one schedules the old object for deletion exactly as a hand picked replacement does, verifies **AC-10**
- Resource: several large PDFs uploaded in one sitting; browser memory does not climb with each, because each parsed document is torn down and every thumbnail's object URL released including the unadopted ones, verifies **AC-15**
- Row action: a removed item offers no Preview, while a live PDF item offers it from both the row and the edit dialog, verifies **AC-16**

## Build plan

Tracer Bullet, per the scope header: the shared parsing primitive goes in first because every later task depends on it being correct, then the offer is taken end to end, then the preview's entry points. Tasks 1 and 2 harden and widen code that already shipped under spec 0015's assumed version of this decision; nothing here adds a dependency.

1. Harden the shared `pdf.js` module: pin `pdfjs-dist`, add a dependency check proving no duplicate copy, move the parse options into one shared object with script evaluation disabled and the character map and standard font asset paths set, serve those assets from the application's own static assets, and make the parse task teardown safe against a double mount, satisfies **AC-11**, **AC-12**, **AC-13**, **AC-14**, **AC-19**
2. Widen the extraction from one page to three: render `min(3, numPages)` pages at 600 pixels wide on a white fill as JPEG at quality `0.9`, return each with its real page number, skip a page that fails rather than abandoning the set, and return nothing at all only when no page renders, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-8**
3. Rework the offer panel into a labelled row of thumbnails with none preselected, arming only on attach or replace, wording itself as a replacement when a cover already exists, uploading only the tapped thumbnail, and releasing every thumbnail's object URL on replace or close, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**, **AC-15**
4. State the orphan rule where the cover is adopted, and confirm an adopted cover flows through spec 0015's existing paths unchanged: its key stored as any cover is, its size and content type checked server side, and a superseded one cleaned up on save, satisfies **AC-9**, **AC-10**
5. Add the Preview action to each Catalogue and Free content row whose item is a PDF and still has a file, alongside the existing entry in the edit dialog, satisfies **AC-16**
6. Make the preview ask for an inline content disposition where the signed URL can carry one, and keep the plain sentence about a browser setting where it cannot, satisfies **AC-17**
7. Prove the two properties that are easy to lose later: strip the bucket's GET origin rules and confirm the offer still works, and replace a generated cover to confirm the cleanup fires, satisfies **AC-18**, **AC-10**

## Consequences

**Positive**:
- The catalogue stops showing gradient placeholders for books whose cover was inside the file, which is the congregation's first impression of the Library screen.
- The cover offer depends on no bucket configuration, so it behaves the same on a laptop, on staging and in production. That is unusual for anything touching R2 in this project and worth keeping.
- No schema change, no new Convex function, no environment variable, no new dependency beyond the one already installed.
- The project owns no PDF rendering surface. The browser's viewer keeps doing the reading, with its own scroll, zoom, find and print.
- The team keeps a feedback loop on a publishing action that reaches everyone, now reachable from the item list rather than only from an edit form.

**Negative and tradeoffs**:
- Up to 25 MB of PDF is parsed in the operator's browser, and three page renders instead of one. Fine on a desktop, slower on a weak machine, and their machine's work rather than the server's.
- PDFs already in the catalogue never get the offer. Anything uploaded before this ships needs a re upload to benefit, and the backfill that would fix it is deliberately not built.
- Rasterising can bake in whatever margins the PDF laid out around the artwork, so a generated cover is sometimes slightly worse framed than a hand picked one. Accepted as the cost of one code path.
- The preview still depends on the viewer's own browser PDF setting. The inline disposition override in task 6 should remove the common case, but a browser configured to download every PDF will still download this one.
- The orphaned object problem spec 0015 defers gets modestly worse: an operator who attaches a PDF, adopts a cover, changes their mind twice and then abandons the form leaves several unreferenced objects rather than one.
- `pdf.js` is a large library and a real parsing surface. It is lazily imported so no page pays for it until a PDF is involved, but it is now in the admin bundle, and keeping it to one pinned deduplicated copy is an ongoing obligation rather than a one off.

**Neutral**:
- No migration. No live data is transformed, no deployment ordering matters, and a revert needs no coordination, though generated cover objects already written to R2 would remain until the deferred sweep exists.
- Tasks 1 to 3 rework code that shipped hours earlier under spec 0015, so this is an unusually fresh refactor rather than a change to settled code.
- Spec 0015's value sourcing table now has a second source for `coverImageUrl` and should say so; see Follow up.
- `react-pdf` was deliberated and not adopted. Anyone revisiting a portal PDF viewer should start from Option 4's cons rather than from scratch.

## Follow-up

- [ ] Spec 0015's **Value sourcing** table names the operator upload as the only source for `coverImageUrl`. Add the generated cover as a second source, pointing at this spec, so the two records do not disagree about where that value comes from.
- [ ] Spec 0015's `verify.md` carries steps written for the assumed version of this decision (page one only, and a plan for a rendered viewer). They need updating to the three page offer and the retained iframe preview before `/check verify` runs.
- [ ] The scope's Library row has this extension ticked as built, on the assumed design. The build plan above supersedes it, so the box should go back to unticked until these tasks land.
- [ ] Investigate the presigned `response-content-disposition=inline` override for the preview URL (task 6). R2 is S3 compatible and the parameter exists, but `@convex-dev/r2`'s `getUrl` takes only an expiry, so this may need its own signer. If it works it removes the preview's last environmental dependency for roughly a line of code; if it does not, the plain sentence stays and nothing is lost.
- [ ] Deferred, not built: a one off action that walks PDF items already in the catalogue with no cover and offers page one for each. Worth enrolling only once the catalogue is big enough that re uploading is the slower path. It would need the bucket's GET origin rule, which is the dependency the live path deliberately avoids.
- [ ] `spec/STORAGE.md` documents the CORS policy as a manual per environment step, and this project's notes record production CORS as pending. Worth confirming the production bucket's policy is applied before anything in the portal relies on a GET rule, including the backfill above.
- [ ] If a portal PDF viewer is ever wanted again, it needs its own spec, and both CORS files need `Content-Range`, `Accept-Ranges` and `Content-Length` added to `exposeHeaders` or `pdf.js` range loading degrades silently to whole file fetches. Option 4's cons are the starting list.
- [ ] The pinned `pdfjs-dist` version is worth a line in `apps/admin/AGENTS.md` once this lands, so a future contributor knows the render call signature is version specific. That is `/sync`'s to write, not this spec's.
- [ ] If the Android check in spec 0015's `verify.md` shows the mobile browser sheet does not render PDFs, the mobile app needs its own renderer. That is a separate decision and a native build, and nothing here carries over: `pdf.js` is a web library.

