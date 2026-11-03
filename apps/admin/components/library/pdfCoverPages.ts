/**
 * Render the opening pages of a PDF to images, in the operator's own browser
 * (spec 0016, AC-1, AC-4 to AC-6, AC-8, AC-11 to AC-15).
 *
 * Many of the Library's PDFs already carry the book's cover as an early page,
 * so this turns those pages into cover images the operator can adopt in one
 * tap instead of hunting down the same picture and uploading it twice.
 *
 * THREE pages, not one, and none of them preselected. The feature exists
 * because *some* PDFs open on their cover, which is the same thing as saying
 * some do not: a scanned book often opens on a blank leaf and an exported one
 * on a half title. Offering only page one would be confidently wrong on a
 * predictable slice of the catalogue, and the operator would have to notice
 * and undo it. Only they can tell a cover from a title page, so they choose.
 *
 * It runs on the FILE THE OPERATOR JUST PICKED, never on the object already in
 * R2, and that is deliberate rather than incidental. A local `File` is read
 * with no network request at all, so this needs no GET origin rule on the
 * bucket (`infra/r2-cors.json`, see `spec/STORAGE.md` §3) and cannot be broken
 * by bucket configuration in any environment (AC-18). It also means no PDF
 * content leaves the operator's machine and no Convex function exists for this
 * at all.
 *
 * `pdfjs-dist` is imported DYNAMICALLY, for two reasons: it must never load
 * during server rendering, and it is about a megabyte that no page should pay
 * for until somebody actually attaches a PDF.
 */

/** How wide a generated cover should be, in pixels. */
const COVER_WIDTH_PX = 600;

/**
 * JPEG rather than PNG, at a quality that keeps cover type legible.
 *
 * A rendered book cover is a photograph-like image, where PNG costs several
 * times the bytes for no visible gain. JPEG has no alpha channel, so the
 * canvas is filled white first — a PDF page with a transparent background
 * would otherwise come out with black behind the artwork.
 */
const COVER_MIME = "image/jpeg";
const COVER_QUALITY = 0.9;

/** How many opening pages to offer. */
const COVER_PAGE_LIMIT = 3;

/**
 * Where pdf.js fetches its own runtime assets from: this app's `public/`,
 * staged there from the pinned package by `scripts/pdfjs-assets.mjs`, which
 * also proves exactly one copy of `pdfjs-dist` is installed (AC-13).
 */
const ASSET_BASE = "/pdfjs/";

/**
 * The options EVERY parse runs with (AC-11, AC-12).
 *
 * One object rather than an argument spelled out at each call site, because
 * pdf.js takes these PER DOCUMENT: a future caller who writes their own
 * `getDocument({ data })` would silently get the defaults back, and one of
 * these is a security setting rather than a preference.
 *
 *  - `isEvalSupported: false` turns off pdf.js's own script evaluation. These
 *    are files the Library team obtained from elsewhere, parsed inside an
 *    authenticated admin session, and a PDF is a document format with an
 *    execution history — CVE-2024-4367 was an arbitrary code execution issue
 *    that turned on exactly this setting being left enabled. The installed
 *    version is well past that fix; this is the belt as well as the braces.
 *  - `cMapUrl` with `cMapPacked`, and `standardFontDataUrl`, are what let a
 *    page whose fonts are not embedded, or which uses CJK text, draw its
 *    glyphs at all. Without them such a page renders BLANK rather than
 *    failing, and a blank cover adopted in good faith is worse than no offer.
 */
const PARSE_OPTIONS = {
  isEvalSupported: false,
  cMapUrl: `${ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
} as const;

/** The module, imported once and shared from then on. The WORKER is not. */
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // `workerSrc`, a path, rather than `workerPort` with a `Worker` this
      // module builds and shares. That difference is what makes a double
      // mount safe (AC-14): from a path, pdf.js spawns ONE WORKER PER PARSE
      // and tears it down with that parse's own loading task. A shared port is
      // marked destroyed by whichever task destroys first, so React's
      // development double mount — render, unmount, render again — would kill
      // the worker under the live mount and report a worker error to an
      // operator who did nothing wrong.
      pdfjs.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}pdf.worker.min.mjs`;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export type PdfCoverPage = {
  /** The page's own one-based number, as pdf.js numbers them. */
  pageNumber: number;
  /** The rendered page, ready to upload as a cover image. */
  blob: Blob;
  /** An object URL for the thumbnail. The caller revokes it when done. */
  previewUrl: string;
};

type ParsedPdf = Awaited<
  ReturnType<Awaited<ReturnType<typeof loadPdfJs>>["getDocument"]>["promise"]
>;

/** One page as an image, or null when that page will not render. */
async function renderOnePage(
  pdf: ParsedPdf,
  pageNumber: number,
): Promise<PdfCoverPage | null> {
  try {
    const page = await pdf.getPage(pageNumber);

    // Scale so the rendered page comes out at COVER_WIDTH_PX wide, whatever
    // paper size the PDF was laid out on.
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH_PX / base.width });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext("2d");
    if (!context) return null;
    // White behind the page, since JPEG carries no alpha.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, COVER_MIME, COVER_QUALITY);
    });
    if (!blob) return null;

    return { pageNumber, blob, previewUrl: URL.createObjectURL(blob) };
  } catch {
    // One page that will not draw — a broken font, an image filter this build
    // cannot decode — must not cost the operator the pages that would have
    // (AC-6). The offer simply comes back shorter, carrying the real page
    // numbers of whatever rendered, so a label still matches the book.
    return null;
  }
}

/**
 * The first few pages of `file` as images, in page order.
 *
 * An EMPTY ARRAY rather than a throw, because this is an offer and not a step
 * (AC-5). A PDF that is encrypted, corrupt, or built in some way this version
 * of pdf.js will not open must leave the upload itself completely unaffected:
 * the file still attaches, the operator simply is not offered a cover. Failing
 * the save over a picture would cost the Library the item.
 */
export async function renderPdfCoverPages(file: File): Promise<PdfCoverPage[]> {
  try {
    const pdfjs = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());

    // Kept as the LOADING TASK, not just the resolved document: `destroy()`
    // lives on the task and is what tears this parse's worker down too.
    const task = pdfjs.getDocument({ ...PARSE_OPTIONS, data });
    try {
      const pdf = await task.promise;
      const wanted = Math.min(COVER_PAGE_LIMIT, pdf.numPages);

      const pages: PdfCoverPage[] = [];
      for (let pageNumber = 1; pageNumber <= wanted; pageNumber += 1) {
        const page = await renderOnePage(pdf, pageNumber);
        if (page) pages.push(page);
      }
      return pages;
    } finally {
      // Release the parsed document and its worker whether or not the renders
      // worked, so an operator who uploads several files in a row does not
      // accumulate either.
      await task.destroy();
    }
  } catch {
    return [];
  }
}

export { COVER_MIME, COVER_PAGE_LIMIT };
