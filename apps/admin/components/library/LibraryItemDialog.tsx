"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  LIBRARY_AUTHOR_MAX_LENGTH,
  LIBRARY_DESCRIPTION_MAX_LENGTH,
  LIBRARY_DETAIL_LINES_MAX,
  LIBRARY_DETAIL_LINE_MAX_LENGTH,
  LIBRARY_ITEM_FORMATS,
  LIBRARY_ITEM_FORMAT_LABELS,
  LIBRARY_ITEM_TYPES,
  LIBRARY_ITEM_TYPE_LABELS,
  LIBRARY_PRICE_UGX_MAX,
  LIBRARY_STARTING_QUANTITY_MAX,
  LIBRARY_TITLE_MAX_LENGTH,
  isDigitalLibraryFormat,
  isValidLibraryTypeFormat,
  type LibraryDigitalFormat,
  type LibraryItemFormat,
  type LibraryItemType,
} from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import { Field } from "@/lib/content-helpers";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { LibraryFileUpload } from "./LibraryFileUpload";
import { libraryError } from "./libraryErrors";

/**
 * Add or edit one catalogue item (spec 0015, AC-6 to AC-8).
 *
 * The form's shape follows the item's: pick a format first, and the rest of
 * the fields follow from it, because a physical item has a price and a count
 * and a digital one has a file. On an EDIT the format picker is narrowed to
 * the side the item is already on — an edit may never cross the physical and
 * digital line (AC-8), and offering the choice only to refuse it afterwards
 * teaches the operator nothing. The sentence under the picker says why.
 *
 * Every cap here comes from `@klt-cyber/shared` and is enforced again in the
 * mutation. `maxLength` on an input is the courtesy; the mutation is the rule.
 */

/**
 * The two panes the form is split across.
 *
 * Named rather than inlined because a refusal has to be able to say WHICH pane
 * its field is on: telling an operator to give the item a title while the
 * title is on the tab they are not looking at is how a form becomes a puzzle.
 */
type Tab = "details" | "media";

export type LibraryItemForEdit = {
  _id: Id<"libraryItems">;
  title: string;
  description: string | null;
  categoryId: Id<"libraryCategories">;
  author: string | null;
  coverImageKey: string | null;
  format: LibraryItemFormat;
  itemType: LibraryItemType;
  detailLines: string[];
  priceUgx: number | null;
  fileKey: string | null;
  audioDurationSeconds: number | null;
};

export function LibraryItemDialog({
  item,
  categories,
  /** Which formats this page's "add" button offers. */
  formatChoices = LIBRARY_ITEM_FORMATS,
  onClose,
}: {
  item: LibraryItemForEdit | null;
  categories: { _id: Id<"libraryCategories">; name: string; hidden: boolean }[];
  formatChoices?: readonly LibraryItemFormat[];
  onClose: () => void;
}) {
  const createItem = useMutation(api.library.createItem);
  const updateItem = useMutation(api.library.updateItem);

  const editing = item !== null;

  // On an edit the picker offers only the side the item is already on. On a
  // create it offers whatever this page is for.
  const availableFormats = editing
    ? LIBRARY_ITEM_FORMATS.filter(
        (f) =>
          isDigitalLibraryFormat(f) === isDigitalLibraryFormat(item.format),
      )
    : formatChoices;

  const [format, setFormat] = useState<LibraryItemFormat>(
    item?.format ?? availableFormats[0] ?? "physical",
  );
  const [itemType, setItemType] = useState<LibraryItemType>(
    item?.itemType ?? "book",
  );
  const [title, setTitle] = useState(item?.title ?? "");
  const [author, setAuthor] = useState(item?.author ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    item?.categoryId ?? categories.find((c) => !c.hidden)?._id ?? "",
  );
  const [coverKey, setCoverKey] = useState<string | undefined>(
    item?.coverImageKey ?? undefined,
  );
  const [detailText, setDetailText] = useState(
    (item?.detailLines ?? []).join("\n"),
  );
  const [price, setPrice] = useState(
    item?.priceUgx !== null && item?.priceUgx !== undefined
      ? String(item.priceUgx)
      : "",
  );
  const [startingQuantity, setStartingQuantity] = useState("");
  const [fileKey, setFileKey] = useState<string | undefined>(
    item?.fileKey ?? undefined,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(
    item?.audioDurationSeconds !== null &&
      item?.audioDurationSeconds !== undefined
      ? String(item.audioDurationSeconds)
      : "",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");

  const physical = format === "physical";
  const digital = isDigitalLibraryFormat(format);

  // A hidden category stays SELECTABLE while it is the item's own, so editing
  // a title does not silently refile the item somewhere else (AC-12).
  const categoryOptions = categories.filter(
    (category) => !category.hidden || category._id === item?.categoryId,
  );

  const detailLines = detailText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Which types this format allows, so the operator never picks a combination
  // the server is about to refuse.
  const typeOptions = LIBRARY_ITEM_TYPES.filter((type) =>
    isValidLibraryTypeFormat(type, format),
  );

  function changeFormat(next: LibraryItemFormat) {
    setFormat(next);
    // Carry the type across only when it still makes sense: merchandise is not
    // a PDF, so switching to PDF falls back rather than holding an invalid pair.
    if (!isValidLibraryTypeFormat(itemType, next))
      setItemType("teaching_material");
  }

  /**
   * Refuse the save, and show the pane the offending field is actually on.
   *
   * Without the second half a refusal can point at a field the operator cannot
   * see, which is worse than no message at all.
   */
  function refuse(message: string, where: Tab) {
    setTab(where);
    setError(message);
  }

  async function handleSave() {
    setError(null);
    if (!title.trim()) return refuse("Give the item a title.", "details");
    if (!categoryId) return refuse("Pick a category.", "details");
    if (detailLines.length > LIBRARY_DETAIL_LINES_MAX) {
      return refuse(
        `Up to ${LIBRARY_DETAIL_LINES_MAX} detail lines.`,
        "details",
      );
    }
    if (physical) {
      if (price.trim() === "") {
        return refuse("A physical item needs a price.", "details");
      }
      if (!editing && startingQuantity.trim() === "") {
        return refuse("A physical item needs a starting quantity.", "details");
      }
    }
    if (digital && !fileKey) {
      return refuse("Upload the PDF or recording first.", "media");
    }

    setSaving(true);
    try {
      if (editing) {
        // `cleared` says which optional fields this save CARRIED as a clear,
        // as opposed to simply not mentioning. Without it the server cannot
        // tell "they removed the cover" from "this form does not edit covers",
        // and the difference decides whether an R2 object gets deleted.
        const cleared: (
          | "description"
          | "author"
          | "coverImageUrl"
          | "detailLines"
          | "audioDurationSeconds"
        )[] = [];
        if (!description.trim()) cleared.push("description");
        if (!author.trim()) cleared.push("author");
        if (!coverKey) cleared.push("coverImageUrl");
        if (detailLines.length === 0) cleared.push("detailLines");
        if (format === "audio" && !duration.trim()) {
          cleared.push("audioDurationSeconds");
        }

        await updateItem({
          itemId: item._id,
          title: title.trim(),
          categoryId: categoryId as Id<"libraryCategories">,
          format,
          itemType,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(author.trim() ? { author: author.trim() } : {}),
          ...(coverKey ? { coverImageUrl: coverKey } : {}),
          ...(detailLines.length > 0 ? { detailLines } : {}),
          ...(physical && price.trim() !== ""
            ? { priceUgx: Number(price) }
            : {}),
          ...(digital && fileKey && fileKey !== item.fileKey
            ? { fileKey }
            : {}),
          ...(format === "audio" && duration.trim() !== ""
            ? { audioDurationSeconds: Number(duration) }
            : {}),
          cleared,
        });
      } else {
        await createItem({
          title: title.trim(),
          categoryId: categoryId as Id<"libraryCategories">,
          format,
          itemType,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(author.trim() ? { author: author.trim() } : {}),
          ...(coverKey ? { coverImageUrl: coverKey } : {}),
          ...(detailLines.length > 0 ? { detailLines } : {}),
          ...(physical
            ? {
                priceUgx: Number(price),
                startingQuantity: Number(startingQuantity),
              }
            : {}),
          ...(digital && fileKey ? { fileKey } : {}),
          ...(format === "audio" && duration.trim() !== ""
            ? { audioDurationSeconds: Number(duration) }
            : {}),
        });
      }
      onClose();
    } catch (mutationError) {
      setError(libraryError(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Fixed height with the chrome pinned, the pattern `EventDialog` set:
          `grid-rows-[auto_1fr_auto]` holds the title, the tabs and the actions
          still, and lets the one panel between them absorb every difference in
          height through its own scroll. The old shape put the whole form in a
          single `max-h-[70vh]` column at `max-w-xl`, which meant a tall stack
          of fields in a narrow dialog AND the Save button scrolling away
          underneath them, because the actions were part of the scrolling
          content. */}
      <AnimatedDialogContent
        open
        className="grid h-[640px] max-w-4xl grid-rows-[auto_1fr_auto] gap-4"
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit this item" : "Add to the catalogue"}
          </DialogTitle>
        </DialogHeader>

        {/* Two panes rather than one roll of fields. The split is the item's
            own: what it IS, and what it carries. Keeping the file beside the
            cover matters more than it looks, because the page offer is raised
            BY attaching a PDF and writes into the cover field: separating them
            would let an action on one tab quietly change a field on another. */}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="flex min-h-0 flex-col gap-3"
        >
          <TabsList className="w-fit shrink-0">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="media">
              {digital ? "File and cover" : "Cover image"}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="details"
            className="subtle-scrollbar min-h-0 overflow-y-auto px-1"
          >
            {/* Two columns for the short fields, which is most of the height
                the old single column was spending. Anything that wants the
                full measure says so itself, so the field order is unchanged
                from the single column version. */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Kind"
                hint={
                  editing
                    ? "A physical item cannot become a digital one, or the other way round. Remove it and add the right one instead."
                    : "Physical items have a price and a stock count. PDFs and recordings are free and open in the app."
                }
              >
                <Select
                  value={format}
                  onValueChange={(v) => changeFormat(v as LibraryItemFormat)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {availableFormats.map((option) => (
                        <SelectItem key={option} value={option}>
                          {LIBRARY_ITEM_FORMAT_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Type">
                <Select
                  value={itemType}
                  onValueChange={(v) => setItemType(v as LibraryItemType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {typeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {LIBRARY_ITEM_TYPE_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Title" htmlFor="library-title">
                <Input
                  id="library-title"
                  value={title}
                  maxLength={LIBRARY_TITLE_MAX_LENGTH}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Praying the Promises"
                />
              </Field>

              <Field
                label="Author or minister (optional)"
                htmlFor="library-author"
              >
                <Input
                  id="library-author"
                  value={author}
                  maxLength={LIBRARY_AUTHOR_MAX_LENGTH}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="e.g. Pastor Grace Nalwoga"
                />
              </Field>

              <Field
                label="Category"
                hint="Manage the list from the Catalogue page."
              >
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                          {category.hidden ? " (hidden)" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                className="sm:col-span-2"
                label="Description (optional)"
                htmlFor="library-description"
              >
                <Textarea
                  id="library-description"
                  rows={3}
                  value={description}
                  maxLength={LIBRARY_DESCRIPTION_MAX_LENGTH}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What a member should know before they come to the desk."
                />
              </Field>

              <Field
                className="sm:col-span-2"
                label={
                  itemType === "merchandise"
                    ? "Variants (optional)"
                    : itemType === "flash_disk_package"
                      ? "What it contains (optional)"
                      : "Extra detail lines (optional)"
                }
                htmlFor="library-details"
                hint={`One per line, up to ${LIBRARY_DETAIL_LINES_MAX} lines of ${LIBRARY_DETAIL_LINE_MAX_LENGTH} characters.`}
              >
                <Textarea
                  id="library-details"
                  rows={3}
                  value={detailText}
                  onChange={(event) => setDetailText(event.target.value)}
                  placeholder={
                    itemType === "merchandise"
                      ? "Navy, large\nWhite, medium"
                      : "Sunday evening series, part 1\nSunday evening series, part 2"
                  }
                />
              </Field>

              {physical && (
                <>
                  <Field
                    label="Price in shillings"
                    htmlFor="library-price"
                    hint="Whole shillings. Shown to members beside the Library desk line."
                  >
                    <Input
                      id="library-price"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={LIBRARY_PRICE_UGX_MAX}
                      step={1}
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder="25000"
                    />
                  </Field>

                  {editing ? (
                    <p className="font-body text-xs text-outline sm:col-span-2">
                      The stock count is changed on the Stock page, by recording
                      a movement, so every change has a reason behind it.
                    </p>
                  ) : (
                    <Field
                      label="Starting quantity"
                      htmlFor="library-quantity"
                      hint="Recorded as the item's first stock movement. Zero is fine — members see “Out of stock”."
                    >
                      <Input
                        id="library-quantity"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={LIBRARY_STARTING_QUANTITY_MAX}
                        step={1}
                        value={startingQuantity}
                        onChange={(event) =>
                          setStartingQuantity(event.target.value)
                        }
                        placeholder="30"
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="media"
            className="subtle-scrollbar min-h-0 overflow-y-auto px-1"
          >
            <div className="flex flex-col gap-5">
              {digital && (
                <>
                  <Field label={format === "pdf" ? "The PDF" : "The recording"}>
                    <LibraryFileUpload
                      format={format as LibraryDigitalFormat}
                      value={fileKey}
                      fileName={fileName}
                      title={title}
                      coverAlreadySet={Boolean(coverKey)}
                      onChange={(key, name) => {
                        setFileKey(key);
                        setFileName(name ?? null);
                      }}
                      // An opening page of an attached PDF, adopted as the
                      // cover on the operator's say-so (spec 0016, AC-9). It
                      // arrives as an ordinary R2 key, so from here on it is
                      // indistinguishable from a cover somebody picked by hand:
                      // `assertCoverWithinLimits` checks its size and content
                      // type server side from R2's own numbers,
                      // `resolveMediaUrl` turns it into a URL the same way, and
                      // `scheduleReplacedMediaCleanupMany` deletes whichever
                      // cover it replaces without knowing or caring that this
                      // one was generated. Writing into the same state as the
                      // Cover image field below is what lets that field still
                      // override it.
                      onCoverAdopted={setCoverKey}
                    />
                  </Field>

                  {format === "audio" && (
                    <Field
                      label="Length in seconds (optional)"
                      htmlFor="library-duration"
                      hint="Only to show a total before the file loads. The player works this out by itself if you leave it empty."
                    >
                      <Input
                        id="library-duration"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                        placeholder="1800"
                      />
                    </Field>
                  )}
                </>
              )}

              <Field label="Cover image (optional)">
                <ImageUpload value={coverKey} onChange={setCoverKey} />
              </Field>
            </div>
          </TabsContent>
        </Tabs>

        {/* The refusal sits with the actions, not in the scrolling pane, so it
            cannot be scrolled out of sight of the button that caused it. */}
        <div className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}

          <DialogFooter>
            <ActionButton variant="neutral" onClick={onClose}>
              Cancel
            </ActionButton>
            <Button size="sm" loading={saving} onClick={handleSave}>
              {editing ? "Save changes" : "Add it"}
            </Button>
          </DialogFooter>
        </div>
      </AnimatedDialogContent>
    </Dialog>
  );
}
