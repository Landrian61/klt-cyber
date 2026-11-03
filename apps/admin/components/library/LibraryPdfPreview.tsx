"use client";

import { ExternalLink } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";

/**
 * Read an attached PDF without leaving the portal (spec 0016, AC-16, AC-17).
 *
 * Spec 0015 gave the Free content page an upload control and no way to read
 * back what was attached, so an operator could not confirm they had uploaded
 * the right file — and the only way to find out was to open the member app.
 * Reached from a row on the Catalogue and Free content tables as well as from
 * inside the edit dialog, since confirming a publish should not mean opening a
 * form you then have to cancel out of.
 *
 * A FULL HEIGHT SHEET, not a centred dialog, because the thing being shown is
 * a portrait page and height is the scarce dimension. A PDF viewer fits a page
 * to the shorter axis, so a page needs roughly 0.71 of the frame's height in
 * width to show whole: at the 70vh a modal dialog gave it, a third of the
 * screen went to margins and the page arrived small enough to defeat the
 * point. The sheet takes the full viewport height, runs about 1024 pixels wide
 * on a desktop, and strips its own padding so every pixel inside belongs to
 * the viewer. It still leaves the table visible beside it, which is worth
 * keeping: the operator is usually checking one row against what they meant to
 * publish, not settling in to read.
 *
 * A dedicated route would read better still, and is deliberately not what this
 * is. A page is new gated surface — its own layer in the three layer
 * authorization model, its own entry in the shell's navigation, its own design
 * questions — and that is a lot of structure to look at a file with. The sheet
 * gives the same reading area and the "open in a new tab" action below gives
 * the full screen case away for free.
 *
 * An IFRAME on the signed URL, not `pdf.js`. An iframe is a document load, so
 * the browser's own PDF viewer renders it with its own scrolling, zoom, page
 * navigation and search for free, and a document load is not subject to CORS —
 * so this needs no GET origin rule on the bucket. Rendering it with `pdf.js`
 * instead would have meant fetching the object cross-origin, which IS governed
 * by the bucket's CORS policy (a manual per-environment step, `spec/STORAGE.md`
 * §3), and then rebuilding a viewer every browser already ships. Spec 0016
 * deliberated that viewer as Option 4 and rejected it for exactly that reason.
 *
 * OPENING IN A NEW TAB is the honest answer to AC-17 rather than only the
 * apology the first version offered. The inline content disposition that would
 * stop a download-everything browser setting mattering CANNOT be asked for
 * here (AC-17's second branch, and spec 0016's Follow up, which left this open
 * to check): R2 is S3 compatible and does support
 * `response-content-disposition` on a presigned GET, but `@convex-dev/r2`'s
 * `getUrl` takes an expiry and nothing else, and a SigV4 URL signs its own
 * query string — so the parameter cannot be appended to a signed URL
 * afterwards without voiding the signature. Carrying it would mean this
 * project signing R2 URLs itself, a second credential path through the one
 * storage gateway. So instead of telling an operator their browser is the
 * problem and leaving them there, the header hands them the same URL as a
 * top level document, where the browser's own viewer is at its most capable
 * and its most likely to render rather than download.
 *
 * The URL comes from `uploads.getFileUrl`, which any signed-in session may
 * call for a key it can name. That is fine here and deliberately NOT how the
 * member path works: `library.getItemFileUrl` re-checks the item's visibility
 * itself, because a member must not be able to reach a hidden item's file.
 * This caller is an operator who is allowed to see hidden items anyway.
 *
 * It is resolved fresh each time the sheet opens and held nowhere else, which
 * is spec 0015's AC-21 rule: a signed URL expires, so the durable value stays
 * the object key and the URL never reaches a document or outlives the sheet.
 */
export function LibraryPdfPreview({
  fileKey,
  title,
  onClose,
}: {
  fileKey: string;
  title: string;
  onClose: () => void;
}) {
  const url = useAuthQuery(api.uploads.getFileUrl, { key: fileKey });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        // `p-0` and `gap-0` override the primitive's own padding: the frame
        // below wants the whole panel. The header carries its own spacing, and
        // `pr-14` keeps the title clear of the sheet's close button.
        className="flex w-[94vw] max-w-5xl flex-col gap-0 p-0"
      >
        {/* No divider under the header: the No Line Rule means the separation
            comes from the tonal step down to the viewer's own surface. */}
        <SheetHeader className="shrink-0 gap-1 px-5 py-4 pr-14">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="truncate">{title}</SheetTitle>
              <SheetDescription className="font-body text-xs text-outline">
                Your browser&apos;s own PDF viewer. If it offers to download
                this instead of showing it, that is a browser setting rather
                than the file — open it in a new tab to read it there.
              </SheetDescription>
            </div>

            {url ? (
              // An anchor rather than a button: this is a navigation, so a
              // middle click or a modifier click should behave as one.
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 rounded-md border border-border bg-surface-low px-3 font-body text-sm font-semibold text-on-surface-variant transition-colors duration-150 hover:bg-surface-high"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                New tab
              </a>
            ) : null}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 bg-surface-low">
          {url === undefined ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : url === null ? (
            <ErrorState />
          ) : (
            <iframe
              src={url}
              title={`${title} (PDF)`}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
