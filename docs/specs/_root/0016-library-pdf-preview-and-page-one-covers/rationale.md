# Rationale: Library page one covers and PDF preview · spec 0016

## Context

> ⚠️ Premise note: this spec went through a round where it also replaced the preview with a viewer built on `react-pdf`. A cross check killed that: a library that fetches PDF bytes to render them is subject to the browser's cross origin rules, where an iframe loading the same signed URL as a document is not, so the viewer would have introduced a dependency on the storage bucket's CORS policy (the rule that says which web origins may read from it) while the spec claimed the opposite. Both policy files also expose only `ETag`, so `pdf.js` range loading would have silently degraded to fetching whole files. That option is recorded below as Option 4 and rejected, and the forced download problem it existed to solve is handled in Follow up with a far cheaper fix. The lesson worth keeping: the two halves of this feature were never one decision, and bundling them hid the cheap answer.

Spec 0015 shipped the Library's free content pipeline: an operator uploads a PDF or a recording, it lands in Cloudflare R2 (the object storage this platform uses for every uploaded file), and the member opens it in the mobile app. Two gaps in that flow surfaced immediately after it landed, both raised by the engineer rather than found in testing.

The first and larger one is about covers. Spec 0015 treats `libraryItems.coverImageUrl` as a field the operator fills by hand, and its own value sourcing table names that upload as the only source. In practice many of the Library's PDFs already carry the book's cover as their first page, because that is simply what a scanned or exported book looks like. Asking the operator to find that same image, save it separately and upload it again is duplicated work, and the realistic outcome is that they skip it: the mobile Library screen then renders a gradient placeholder for a book whose cover was inside the file all along. That screen is the congregation's first impression of the catalogue, so a shelf of gradient rectangles is a product cost rather than a cosmetic one.

The second is that the portal gave the team no way to read back what they had attached. An operator who uploaded the wrong teaching had no way to find out except opening the member app on a phone. `/develop` closed that with an iframe on the file's signed URL, which is the browser's own viewer and costs no code.

Both sit entirely in `apps/admin`, which is a browser, and neither needs the backend to change. The constraint that shapes the design is where the PDF bytes can be read from, and what has to be true of the environment for that reading to work. That constraint is what separates a feature that behaves the same everywhere from one that depends on a manual per environment step.

## Options considered

### Option 1: Change nothing

Leave spec 0015 as it shipped. Covers stay hand uploaded and the iframe preview stays as it is.

**Pros**:
- No new dependency, no new code, nothing more to maintain.
- The browser's built in PDF viewer is genuinely excellent, with scroll, zoom, find and print for free.

**Cons**:
- Leaves the product problem untouched: PDF items keep showing gradient placeholders whenever nobody uploads a cover separately, which is most of the time.
- The congregation's first impression of the Library screen stays worse than the content behind it deserves.

### Option 2: Derive the cover on the server

Have a Convex action fetch the uploaded object from R2 and render its first page server side.

**Pros**:
- Would work for PDFs already in the catalogue, not only newly uploaded ones, so the whole back catalogue could be retrofitted.
- The operator's machine and browser would not matter at all.

**Cons**:
- Not actually buildable here. Rasterising a PDF page needs a canvas implementation, which in a server runtime means a native binary and its image libraries. Convex's function environment does not host that, so this is a dead end rather than a tradeoff.
- Would push every uploaded PDF, up to 25 MB, through a function invocation for the sake of one thumbnail.

### Option 3: Derive in the browser from the local file, keep the browser's viewer

Run `pdf.js` client side. Render the first three pages of the file the operator just picked, before it is uploaded, and offer them as cover thumbnails. Leave the preview as the browser's own viewer in an iframe.

**Pros**:
- The extraction needs no network request at all, so it cannot be broken by bucket configuration in any environment, and no PDF content leaves the operator's machine.
- Solves the product problem (placeholder covers) without the project owning a rendering surface.
- One dependency, already installed, used for one job.

**Cons**:
- Parses up to 25 MB of PDF in the operator's browser, which is work their machine does rather than the server's.
- Only covers newly uploaded PDFs; anything already in the catalogue needs a re upload to benefit.
- Rasterising can bake in whatever margins the PDF laid out around the artwork, so a generated cover is sometimes slightly worse framed than a hand picked one.
- The preview stays subject to the viewer's own browser setting, which in rare configurations turns it into a download.

### Option 4: Option 3, and also replace the preview with our own viewer

As Option 3, plus a continuous scroll viewer built on `react-pdf` with page navigation, zoom and a text layer, replacing the iframe.

**Pros**:
- Deterministic: the PDF renders in the portal whatever the viewer's browser settings, and the apologetic caveat line disappears.
- Gives the team a genuine reading surface for teachings, not only a way to check an upload.

**Cons**:
- Introduces a hard dependency on the bucket's CORS policy, because rendering means fetching bytes, and a cross origin byte fetch needs a GET origin rule where an iframe document load does not. Both policy files also expose only `ETag`, so range loading degrades silently to whole file fetches. The project's own notes record production CORS as possibly not yet applied, which makes this a release risk rather than a detail.
- Regresses spec 0015's AC-21 unless carefully built: the portal's URL source is a reactive query, so a rerun re signs the URL and reloads the document under the reader, which is exactly the failure that AC made a one shot action to avoid.
- Native find only searches mounted pages, so the promise of searchable text is false on precisely the long books where it matters, unless an in viewer search is also built.
- The project owns a rendering surface: scroll restoration, canvas memory on long books, text layer alignment across zoom levels, display density scaling, and the platform canvas area limits that make a large page at high zoom render blank.
- A second dependency whose own `pdfjs-dist` is a normal dependency rather than a peer, so one shared instance is a version alignment task rather than a given.

## Rationale

The decisive force is where the bytes can be read without the design depending on something outside the code. Spec 0015's own storage runbook makes the bucket's CORS policy a manual step applied per environment, and this repository's record of that step is a file in `infra/`, not a guarantee that it was ever applied. A feature that reads the local `File` object the operator has just chosen has no such dependency: there is no request, no origin and no policy to get wrong, so it behaves identically on a laptop, on staging and in production. That is the one property of this design worth protecting, and it is what pins the offer to upload time even though the edit case is technically open. Option 2 fails on the same axis for a harder reason: it is not buildable, because server side rasterising needs a native canvas the function runtime does not host.

Three pages rather than one comes straight out of the engineer's own framing. The feature exists because *some* PDFs carry the cover as page one, which is also an admission that some do not: a scanned book may open on a blank leaf, an exported one often on a half title. Offering only page one would be confidently wrong on a predictable fraction of the catalogue, and being confidently wrong is worse than being absent, because the operator has to notice and undo it. Three thumbnails with none preselected costs two more page renders and turns a guess into a choice. The same instinct drives the offer never applying itself: the operator is the only party who can tell a cover from a title page, so the design asks them.

Option 4 is recorded in full because the engineer chose it in an earlier round of this deliberation, and it was wrong on a point of fact rather than of taste. The spec then claimed that neither half needed a GET origin rule on the bucket, and that was false: an iframe loading a signed URL is a document load, which cross origin rules do not govern, but a library that fetches the bytes to draw them itself is making an ordinary cross origin request and needs the bucket to permit it. The viewer would therefore have taken on the exact dependency the spec advertised avoiding, and would have done so while the project's notes still record production CORS as pending. The earlier round also presented "keep the iframe" only bundled with "derive no covers", which hid the option that actually wins: the two halves were never one decision. Rejecting Option 4 removes a release risk, nine open build questions, and a rendering surface this project would have had to maintain, and it costs only a rare browser setting that Follow up addresses for roughly one line of code.

The remaining decisions are about not shipping a feature that fails quietly. Character maps and standard font data are configured because without them a PDF with unembedded or CJK fonts renders a blank page, and a blank cover adopted in good faith is worse than no offer at all. Script evaluation is disabled through one shared options object rather than per call site, because `pdf.js` takes it per document and a future caller who omits it reintroduces the risk; `pdf.js` had an arbitrary code execution issue in 2024 that turned on exactly this setting, and while the installed version is well past the fix, these are files the Library team obtained from elsewhere and parsed inside an authenticated admin session (basis: CVE-2024-4367, and disabling evaluation when parsing documents from outside your trust boundary). The version is pinned and checked for duplicates because the render call this code uses belongs to version 6 and would break against a quietly hoisted version 4.

## References

**Project sources** (verifiable, in this repo):
- `spec/STORAGE.md` §3, which documents the R2 CORS policy as a manual step applied per environment, and `infra/r2-cors.json` / `infra/r2-cors-prod.json`, which allow `GET` and `PUT` for the admin origins but expose only `ETag`
- spec 0015 (`0015-library-catalogue-free-content-stock/index.md`), whose AC-6 and **Value sourcing** table define `coverImageUrl` as operator uploaded, and whose AC-8, AC-9, AC-18 and AC-21 define the cover cap, the cleared `fileKey` on removal, the server side metadata check and the signed URL rule this spec inherits unchanged
- `convex/uploads.ts`, the single auth gated storage gateway whose `generateUploadUrl` / `syncMetadata` / `getFileUrl` round trip this feature composes rather than adds to
- `convex/lib/media.ts`, whose `toR2Key` and `resolveMediaUrl` are why a generated cover needs no special handling downstream
- `apps/admin/AGENTS.md`, the convention that an existing component is reached for before new markup is written
- `spec/INTERFACE_SPEC.md` §12.2 and §12.3, the shared error and empty state treatments the offer panel uses
- the `pdfjs-dist` version already installed in `apps/admin` (6.4.x), whose `page.render({ canvas, viewport })` signature this code depends on

**Practices and standards**:
- CVE-2024-4367, the `pdf.js` arbitrary code execution issue that turned on script evaluation being enabled, and the practice of disabling evaluation when parsing documents from outside your trust boundary
- The browser's same origin policy distinction between a document load, which it does not govern, and a byte fetch, which it does. This is what makes an iframe preview configuration free and a rendered viewer configuration dependent, and it is the point the first draft of this spec got wrong
- Boring technology as a feature: declining to own a rendering surface the browser already provides
- Reading from the client's own file handle rather than re fetching an uploaded object, to remove a configuration dependency from a path that does not need one
- Offering a derived value for confirmation rather than applying it, when only the human can tell a correct derivation from a plausible one
