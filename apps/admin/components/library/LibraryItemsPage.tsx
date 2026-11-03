"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Eye, EyeOff, FileText, FolderCog, Plus, Trash2 } from "lucide-react";
import {
  LIBRARY_ITEM_FORMATS,
  LIBRARY_ITEM_FORMAT_LABELS,
  LIBRARY_ITEM_TYPE_LABELS,
  LIBRARY_LOW_STOCK_THRESHOLD,
  formatUgx,
  isDigitalLibraryFormat,
  type LibraryItemFormat,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Badge } from "@/components/shadcn/badge";
import { Reveal } from "@/components/motion/Reveal";
import {
  LibraryItemDialog,
  type LibraryItemForEdit,
} from "./LibraryItemDialog";
import { LibraryCategoriesDialog } from "./LibraryCategoriesDialog";
import { LibraryPdfPreview } from "./LibraryPdfPreview";
import { libraryError } from "./libraryErrors";

/**
 * The Library team's view of what the church carries (spec 0015, AC-6 to
 * AC-12, AC-18, AC-19).
 *
 * One component behind two pages, because they are one list seen through two
 * windows: Catalogue shows everything, Free content shows only what opens in
 * the app. Splitting them into two implementations would have meant two
 * copies of the hide, remove and edit plumbing, and the second copy is always
 * the one that falls behind.
 *
 * Hidden items stay LISTED here, marked, which is the whole difference between
 * this and the member's screen: the team is still working on something they
 * have taken off the app, so hiding it must not hide it from them too (AC-9).
 */

type Scope = "all" | "free";

export function LibraryItemsPage({ scope }: { scope: Scope }) {
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<LibraryItemFormat | "all">(
    "all",
  );
  const [includeHidden, setIncludeHidden] = useState(true);
  const [dialogItem, setDialogItem] = useState<LibraryItemForEdit | null>(null);
  const [adding, setAdding] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  // The PDF being read back from a row, held only while its dialog is open.
  const [previewItem, setPreviewItem] = useState<{
    fileKey: string;
    title: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setItemHidden = useMutation(api.library.setItemHidden);
  const removeItem = useMutation(api.library.removeItem);

  const items = useAuthQuery(api.library.listItemsForTeam, {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(formatFilter !== "all" ? { format: formatFilter } : {}),
    includeHidden,
  });
  const categories = useAuthQuery(api.library.listCategories, {});

  const free = scope === "free";

  // The format segment is only meaningful on the Catalogue page. Free content
  // is already one side of the line, so offering "Physical" there would be a
  // filter that can only ever return nothing.
  const formatSegments: (LibraryItemFormat | "all")[] = free
    ? ["all", "pdf", "audio"]
    : ["all", ...LIBRARY_ITEM_FORMATS];

  const rows =
    items === undefined
      ? undefined
      : items === null
        ? undefined
        : items.filter((item) =>
            free ? isDigitalLibraryFormat(item.format) : true,
          );

  async function run(id: string, action: () => Promise<unknown>) {
    setError(null);
    setBusyId(id);
    try {
      await action();
    } catch (mutationError) {
      setError(libraryError(mutationError));
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<NonNullable<typeof rows>[number]>[] = [
    {
      key: "title",
      header: "Item",
      render: (item) => (
        <div className="flex min-w-0 items-center gap-3">
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImageUrl}
              alt=""
              className="size-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="size-10 shrink-0 rounded-md bg-surface-low" />
          )}
          <span className="min-w-0">
            <span className="block truncate font-body text-sm font-semibold text-on-surface">
              {item.title}
            </span>
            <span className="block truncate font-body text-xs text-on-surface-variant">
              {[item.author, item.categoryName].filter(Boolean).join(" · ") ||
                "No author or category"}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      render: (item) => (
        <span className="font-body text-xs text-on-surface-variant">
          {LIBRARY_ITEM_FORMAT_LABELS[item.format]} ·{" "}
          {LIBRARY_ITEM_TYPE_LABELS[item.itemType]}
        </span>
      ),
    },
    {
      key: "price",
      header: free ? "Size" : "Price",
      align: "right",
      render: (item) =>
        isDigitalLibraryFormat(item.format) ? (
          <span className="font-body text-xs text-on-surface-variant">
            {item.fileSizeBytes
              ? `${(item.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
              : "—"}
          </span>
        ) : (
          <span className="font-mono text-sm text-on-surface">
            {item.priceUgx === null ? "—" : formatUgx(item.priceUgx)}
          </span>
        ),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      render: (item) =>
        item.quantityOnHand === null ? (
          <Badge variant="member">Free</Badge>
        ) : item.quantityOnHand === 0 ? (
          <Badge variant="rejected">Out of stock</Badge>
        ) : item.quantityOnHand <= LIBRARY_LOW_STOCK_THRESHOLD ? (
          <Badge variant="pending">
            <span className="font-mono">{item.quantityOnHand}</span>
          </Badge>
        ) : (
          <span className="font-mono text-sm text-on-surface">
            {item.quantityOnHand}
          </span>
        ),
    },
    {
      key: "state",
      header: "Shown",
      render: (item) =>
        item.hidden ? (
          <Badge variant="neutral">Hidden</Badge>
        ) : (
          <Badge variant="verified">Live</Badge>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (item) => {
        // Reading back what was published, without opening an edit form to
        // then cancel out of (spec 0016, AC-16). Offered only for a PDF that
        // still HAS a file: `removeItem` clears `fileKey`, so a removed item
        // has nothing to show and says nothing about it.
        const previewKey = item.format === "pdf" ? item.fileKey : null;

        return (
          <div className="flex items-center justify-end gap-1.5">
            {previewKey && (
              <button
                type="button"
                aria-label={`Preview ${item.title}`}
                onClick={() =>
                  setPreviewItem({ fileKey: previewKey, title: item.title })
                }
                className="flex size-9 items-center justify-center rounded-full text-outline transition hover:bg-surface-low hover:text-on-surface"
              >
                <FileText className="size-4" aria-hidden="true" />
              </button>
            )}
            <ActionButton
              variant="neutral"
              onClick={() =>
                setDialogItem({
                  _id: item._id,
                  title: item.title,
                  description: item.description,
                  categoryId: item.categoryId,
                  author: item.author,
                  coverImageKey: item.coverImageKey,
                  format: item.format,
                  itemType: item.itemType,
                  detailLines: item.detailLines,
                  priceUgx: item.priceUgx,
                  fileKey: item.fileKey,
                  audioDurationSeconds: item.audioDurationSeconds,
                })
              }
            >
              Edit
            </ActionButton>
            <button
              type="button"
              aria-label={
                item.hidden ? `Show ${item.title}` : `Hide ${item.title}`
              }
              disabled={busyId === item._id}
              onClick={() =>
                run(item._id, () =>
                  setItemHidden({ itemId: item._id, hidden: !item.hidden }),
                )
              }
              className="flex size-9 items-center justify-center rounded-full text-outline transition hover:bg-surface-low hover:text-on-surface disabled:opacity-40"
            >
              {item.hidden ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              aria-label={`Remove ${item.title}`}
              disabled={busyId === item._id}
              onClick={() => {
                // A removal deletes the files and cannot be undone as a live
                // item, so it asks first. Hiding is the reversible neighbour and
                // is one button to the left.
                const ok = window.confirm(
                  `Remove “${item.title}” from the catalogue? Its files are deleted and this cannot be undone. The stock history stays.`,
                );
                if (ok)
                  void run(item._id, () => removeItem({ itemId: item._id }));
              }}
              className="flex size-9 items-center justify-center rounded-full text-outline transition hover:bg-crimson-light hover:text-crimson disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Heading as="h1" size="xl">
            {free ? "Free content" : "Catalogue"}
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            {free
              ? "The PDFs and recordings the congregation can open in the app."
              : "Everything the Library carries, priced or free."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!free && (
            <ActionButton
              variant="neutral"
              onClick={() => setManagingCategories(true)}
            >
              <FolderCog className="size-4" aria-hidden="true" />
              Categories
            </ActionButton>
          )}
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {free ? "Upload something" : "Add an item"}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          onDebouncedChange={setSearch}
          placeholder="Search by title or author"
          className="min-w-[16rem] flex-1"
        />

        <div
          role="group"
          aria-label="Filter by kind"
          className="flex items-center gap-1 rounded-full bg-surface-low p-1"
        >
          {formatSegments.map((segment) => {
            const active = formatFilter === segment;
            return (
              <button
                key={segment}
                type="button"
                aria-pressed={active}
                onClick={() => setFormatFilter(segment)}
                className={
                  active
                    ? "rounded-full bg-surface-lowest px-3 py-1.5 font-body text-xs font-semibold text-on-surface shadow-e1"
                    : "rounded-full px-3 py-1.5 font-body text-xs font-semibold text-on-surface-variant transition hover:text-on-surface"
                }
              >
                {segment === "all"
                  ? "All"
                  : LIBRARY_ITEM_FORMAT_LABELS[segment]}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 font-body text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(event) => setIncludeHidden(event.target.checked)}
            className="size-4 accent-primary"
          />
          Show hidden items
        </label>
      </div>

      {error && (
        <p role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      )}

      {items === null ? (
        <ErrorState />
      ) : (
        <Reveal as="section">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(item) => item._id}
            empty={
              <EmptyState
                title={
                  search.trim()
                    ? "Nothing matches that"
                    : free
                      ? "No free content yet"
                      : "The catalogue is empty"
                }
                message={
                  search.trim()
                    ? "Try a shorter search, or clear the filters."
                    : free
                      ? "Upload a teaching PDF or a recording and the congregation can open it in the app."
                      : "Add the first thing the Library carries."
                }
              />
            }
          />
        </Reveal>
      )}

      {(adding || dialogItem) && (
        <LibraryItemDialog
          item={dialogItem}
          categories={(categories ?? []).map((category) => ({
            _id: category._id,
            name: category.name,
            hidden: category.hidden,
          }))}
          formatChoices={free ? ["pdf", "audio"] : LIBRARY_ITEM_FORMATS}
          onClose={() => {
            setAdding(false);
            setDialogItem(null);
          }}
        />
      )}

      {previewItem && (
        <LibraryPdfPreview
          fileKey={previewItem.fileKey}
          title={previewItem.title}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {managingCategories && (
        <LibraryCategoriesDialog
          categories={categories ?? undefined}
          onClose={() => setManagingCategories(false)}
        />
      )}
    </div>
  );
}
