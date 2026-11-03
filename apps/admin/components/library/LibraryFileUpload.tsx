"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Eye, ImageDown } from "lucide-react";
import {
  LIBRARY_FILE_MAX_BYTES,
  LIBRARY_FORMAT_CONTENT_TYPES,
  type LibraryDigitalFormat,
} from "@klt-cyber/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ActionButton } from "@/components/ui/ActionButton";
import { LibraryPdfPreview } from "./LibraryPdfPreview";
import {
  COVER_MIME,
  renderPdfCoverPages,
  type PdfCoverPage,
} from "./pdfCoverPages";

/**
 * Upload a free content file to R2 and hand back its object KEY (AC-18).
 *
 * The same round trip as `ImageUpload`: ask for an upload URL, PUT the bytes
 * straight to R2, then `syncMetadata` so the bucket's record of the object
 * exists. That last call is load bearing here rather than merely tidy — the
 * mutation reads the object's real size and content type back through it, so a
 * key uploaded without it looks to the server like a key with no object behind
 * it and is refused.
 *
 * The size and type check below is a COURTESY, not the limit. It saves the
 * operator a 40 MB upload that was always going to be refused, and it is
 * trivially bypassable, which is exactly why `createItem` checks R2's own
 * numbers and not these.
 *
 * Two things here come from spec 0016 rather than 0015: an attached PDF can be
 * previewed in place, and the first three pages of a freshly attached PDF are
 * OFFERED as the item's cover. Both are scoped so that neither needs a GET
 * origin rule on the bucket — see `pdfCoverPages.ts` and `LibraryPdfPreview.tsx`.
 */
export function LibraryFileUpload({
  format,
  value,
  fileName,
  title,
  coverAlreadySet = false,
  onChange,
  onCoverAdopted,
  disabled,
}: {
  format: LibraryDigitalFormat;
  /** The stored R2 key, or undefined when nothing is attached yet. */
  value?: string;
  /** What to call the attached file in the UI, when the name is known. */
  fileName?: string | null;
  /** The item's title, for the preview dialog's heading. */
  title?: string;
  /** Whether the item already has a cover, which changes the offer's wording. */
  coverAlreadySet?: boolean;
  onChange: (key: string | undefined, fileName?: string) => void;
  /** Called with the R2 key of a cover generated from a chosen page (spec 0016). */
  onCoverAdopted?: (key: string) => void;
  disabled?: boolean;
}) {
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const syncMetadata = useMutation(api.uploads.syncMetadata);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // The opening pages of the PDF just attached, waiting to be chosen from or
  // ignored. ARMED BY AN ATTACH OR A REPLACE AND NOTHING ELSE (AC-7): opening
  // an existing item for editing starts here empty, because the offer reads
  // the local file the operator picked and there is none in hand.
  const [coverPages, setCoverPages] = useState<PdfCoverPage[]>([]);
  /**
   * Choosing and adopting are two steps, and NONE of the pages starts chosen
   * (AC-1). Tapping a thumbnail only highlights it; the button beside them is
   * what uploads. That is one more tap than adopting on the thumbnail itself,
   * and it buys two things: an accidental tap costs the bucket nothing, and
   * the operator can compare the three pages before committing to one.
   */
  const [chosenPage, setChosenPage] = useState<number | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [adoptedPage, setAdoptedPage] = useState<number | null>(null);

  const accepted = LIBRARY_FORMAT_CONTENT_TYPES[format];
  const maxMb = Math.round(LIBRARY_FILE_MAX_BYTES / (1024 * 1024));

  // Object URLs are a manual allocation the browser will not reclaim on its
  // own. Letting go of EVERY thumbnail, including the ones nobody adopted,
  // when the set is replaced or the form closes is what keeps an operator who
  // uploads several PDFs in one sitting from accumulating bitmaps (AC-15).
  useEffect(() => {
    return () => {
      for (const page of coverPages) URL.revokeObjectURL(page.previewUrl);
    };
  }, [coverPages]);

  /** PUT one blob through the R2 gateway and return its key. */
  async function putObject(body: Blob, contentType: string): Promise<string> {
    const { key, url } = await generateUploadUrl();
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    // Without this the server sees a key with no object behind it.
    await syncMetadata({ key });
    return key;
  }

  async function handleFile(file: File) {
    setError(null);

    if (file.size > LIBRARY_FILE_MAX_BYTES) {
      setError(
        `That file is ${Math.round(file.size / (1024 * 1024))} MB. The limit is ${maxMb} MB.`,
      );
      return;
    }
    if (!(accepted as readonly string[]).includes(file.type)) {
      setError(
        format === "pdf"
          ? "A PDF teaching has to be a .pdf file."
          : "A recording has to be an MP3 or an M4A.",
      );
      return;
    }

    setBusy(true);
    try {
      const key = await putObject(file, file.type);
      onChange(key, file.name);

      // The cover offer, after the file itself is safely attached. Rendering
      // can fail on an encrypted or malformed PDF, and when it does the upload
      // stands and the operator is simply offered nothing (spec 0016, AC-5).
      if (format === "pdf") {
        setAdoptedPage(null);
        setChosenPage(null);
        const pages = await renderPdfCoverPages(file);
        // Replacing the set here is what releases the previous one, through
        // the cleanup above. An empty result clears the old offer too, which
        // is right: it belonged to a file that is no longer attached.
        setCoverPages(pages);
      }
    } catch {
      setError("That upload did not finish. Try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /**
   * Upload the page the operator tapped and hand its key up as the cover.
   *
   * Only the tapped one is uploaded, so ignoring the offer costs the bucket
   * nothing at all. A superseded generated cover — the operator adopts page
   * one, then page three — is an ORPHAN in R2 until the deferred sweep spec
   * 0015 records exists: `scheduleReplacedMediaCleanupMany` only ever sees the
   * cover the item was SAVED with, so an intermediate choice is never passed
   * to it. That is bounded by how many times one operator changed their mind
   * in one form session, and it is stated here rather than left for a reader
   * to work out (AC-10).
   */
  async function adoptChosenCover() {
    const page = coverPages.find((p) => p.pageNumber === chosenPage);
    if (!page || !onCoverAdopted) return;
    setError(null);
    setAdopting(true);
    try {
      const key = await putObject(page.blob, COVER_MIME);
      onCoverAdopted(key);
      setAdoptedPage(page.pageNumber);
    } catch {
      // The PDF stays attached and the item keeps whatever cover it had: a
      // picture that would not upload must never cost the Library the item.
      setError(
        "That cover did not upload. Try again, or pick a cover by hand.",
      );
    } finally {
      setAdopting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accepted.join(",")}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-lowest p-3 shadow-e1">
          <span className="min-w-0 flex-1 truncate font-body text-sm text-on-surface">
            {fileName ??
              (format === "pdf" ? "PDF attached" : "Recording attached")}
          </span>
          {format === "pdf" && (
            <ActionButton
              variant="neutral"
              disabled={busy}
              onClick={() => setPreviewing(true)}
            >
              <Eye className="size-4" aria-hidden="true" />
              Preview
            </ActionButton>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full items-center justify-center rounded-md border border-border bg-surface-lowest font-body text-sm text-on-surface-variant shadow-e1 transition hover:bg-surface-low disabled:opacity-60 disabled:shadow-none"
        >
          {busy
            ? "Uploading…"
            : format === "pdf"
              ? `Upload a PDF (up to ${maxMb} MB)`
              : `Upload an MP3 or M4A (up to ${maxMb} MB)`}
        </button>
      )}

      {/* The cover offer: the opening pages, NONE of them preselected. An
          offer and never applied by itself, because plenty of teaching PDFs
          open on a blank leaf or a half title, and only the operator can tell
          a cover from a title page (spec 0016, AC-1, AC-3). */}
      {coverPages.length > 0 && onCoverAdopted && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-low p-3">
          <div className="flex flex-col gap-0.5">
            <p className="font-body text-sm font-semibold text-on-surface">
              {adoptedPage !== null
                ? `Using page ${adoptedPage} as the cover`
                : coverPages.length === 1
                  ? "The page this PDF opens on"
                  : "How this PDF opens"}
            </p>
            <p className="font-body text-xs text-on-surface-variant">
              {adoptedPage !== null
                ? "Pick a different page if you would rather, or replace it under Cover image below."
                : coverAlreadySet
                  ? "If one of these is the book's own cover, use it instead of the cover already set."
                  : "If one of these is the book's own cover, use it rather than uploading one separately."}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <ul
              className="flex flex-wrap gap-2"
              aria-label="Pages offered as the cover"
            >
              {coverPages.map((page) => {
                const chosen = chosenPage === page.pageNumber;
                const inUse = adoptedPage === page.pageNumber;
                return (
                  <li key={page.pageNumber}>
                    <button
                      type="button"
                      disabled={adopting}
                      aria-pressed={chosen}
                      onClick={() => setChosenPage(page.pageNumber)}
                      className={
                        chosen
                          ? "flex w-24 flex-col items-center gap-1.5 rounded-md bg-primary-light p-1.5 transition disabled:opacity-60"
                          : "flex w-24 flex-col items-center gap-1.5 rounded-md p-1.5 transition hover:bg-surface-lowest disabled:opacity-60"
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.previewUrl}
                        alt={`Page ${page.pageNumber} of the PDF you just attached`}
                        className="h-24 w-full rounded-sm bg-surface-lowest object-contain shadow-e1"
                      />
                      <span
                        className={
                          chosen
                            ? "font-body text-xs font-semibold text-primary-container"
                            : "font-body text-xs font-semibold text-on-surface-variant"
                        }
                      >
                        {inUse
                          ? `Page ${page.pageNumber} · in use`
                          : `Page ${page.pageNumber}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <ActionButton
              className="mb-1.5"
              loading={adopting}
              disabled={chosenPage === null || chosenPage === adoptedPage}
              onClick={() => void adoptChosenCover()}
            >
              <ImageDown className="size-4" aria-hidden="true" />
              {adoptedPage === null
                ? "Use as the cover"
                : "Use this one instead"}
            </ActionButton>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="font-body text-xs text-error">
          {error}
        </p>
      )}

      {previewing && value && (
        <LibraryPdfPreview
          fileKey={value}
          title={title?.trim() ? title : (fileName ?? "The attached PDF")}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}
