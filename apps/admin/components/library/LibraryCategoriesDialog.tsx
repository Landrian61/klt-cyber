"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { LIBRARY_CATEGORY_NAME_MAX_LENGTH } from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { libraryError } from "./libraryErrors";

/**
 * The editable category list (spec 0015, AC-11, AC-12).
 *
 * Four actions, in the order an operator reaches for them: add, rename,
 * reorder, hide. Delete is the fifth and is deliberately the awkward one — a
 * category still carrying items refuses to go, and says how many, because
 * hiding it is almost always what was actually wanted and deleting it would
 * strand the items.
 *
 * Reordering is up and down arrows rather than drag and drop. The list is
 * short, a keyboard can use arrows, and a drag handle on a dialog that already
 * scrolls is a fight between two gestures.
 */

type Category = {
  _id: Id<"libraryCategories">;
  name: string;
  order: number;
  hidden: boolean;
  itemCount: number;
};

export function LibraryCategoriesDialog({
  categories,
  onClose,
}: {
  categories: Category[] | undefined;
  onClose: () => void;
}) {
  const createCategory = useMutation(api.library.createCategory);
  const updateCategory = useMutation(api.library.updateCategory);
  const deleteCategory = useMutation(api.library.deleteCategory);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<Id<"libraryCategories"> | null>(
    null,
  );
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = categories ?? [];

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (mutationError) {
      setError(libraryError(mutationError));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    await run(async () => {
      await createCategory({ name: newName.trim() });
      setNewName("");
    });
  }

  async function handleRename(categoryId: Id<"libraryCategories">) {
    if (!draftName.trim()) return;
    await run(async () => {
      await updateCategory({ categoryId, name: draftName.trim() });
      setEditingId(null);
    });
  }

  async function handleMove(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    await run(() =>
      updateCategory({ categoryId: rows[index]._id, order: target }),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* The add row and the note stay put; only the list between them
          scrolls, and it scrolls with the slim tonal bar rather than the
          chunky OS one. A `max-h` here rather than a fixed height, because an
          empty list should not open a tall dialog with nothing in it. */}
      <AnimatedDialogContent
        open
        className="grid max-h-[80vh] grid-rows-[auto_auto_1fr_auto] gap-4 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor="library-new-category"
              className="mb-1 block font-body text-sm font-semibold text-on-surface"
            >
              Add a category
            </label>
            <Input
              id="library-new-category"
              value={newName}
              maxLength={LIBRARY_CATEGORY_NAME_MAX_LENGTH}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Teachings"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleAdd();
              }}
            />
          </div>
          <Button
            size="sm"
            loading={busy}
            disabled={!newName.trim()}
            onClick={handleAdd}
          >
            Add
          </Button>
        </div>

        <div className="subtle-scrollbar min-h-0 overflow-y-auto px-1">
          {rows.length === 0 ? (
            <EmptyState
              title="No categories yet"
              message="Add one, then you can file items under it."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((category, index) => (
                <li
                  key={category._id}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-lowest p-3 shadow-e1"
                >
                  {editingId === category._id ? (
                    <>
                      <Input
                        value={draftName}
                        maxLength={LIBRARY_CATEGORY_NAME_MAX_LENGTH}
                        autoFocus
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter")
                            void handleRename(category._id);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1"
                      />
                      <ActionButton
                        loading={busy}
                        onClick={() => handleRename(category._id)}
                      >
                        Save
                      </ActionButton>
                      <ActionButton
                        variant="neutral"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </ActionButton>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(category._id);
                          setDraftName(category.name);
                        }}
                        className="min-w-0 flex-1 text-left font-body text-sm font-semibold text-on-surface hover:text-primary"
                      >
                        <span className="truncate">{category.name}</span>
                      </button>

                      <span className="shrink-0 font-mono text-xs text-outline">
                        {category.itemCount}
                      </span>
                      {category.hidden && (
                        <Badge variant="neutral">Hidden</Badge>
                      )}

                      <button
                        type="button"
                        aria-label={`Move ${category.name} up`}
                        disabled={index === 0 || busy}
                        onClick={() => handleMove(index, -1)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-outline transition hover:bg-surface-low hover:text-on-surface disabled:opacity-40"
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${category.name} down`}
                        disabled={index === rows.length - 1 || busy}
                        onClick={() => handleMove(index, 1)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-outline transition hover:bg-surface-low hover:text-on-surface disabled:opacity-40"
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={
                          category.hidden
                            ? `Show ${category.name}`
                            : `Hide ${category.name}`
                        }
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            updateCategory({
                              categoryId: category._id,
                              hidden: !category.hidden,
                            }),
                          )
                        }
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-outline transition hover:bg-surface-low hover:text-on-surface disabled:opacity-40"
                      >
                        {category.hidden ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${category.name}`}
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            deleteCategory({ categoryId: category._id }),
                          )
                        }
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-outline transition hover:bg-crimson-light hover:text-crimson disabled:opacity-40"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-body text-xs text-outline">
            Hiding a category takes it off the member&apos;s filters and the new
            item form. Items already filed under it keep showing its name.
          </p>

          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}
        </div>
      </AnimatedDialogContent>
    </Dialog>
  );
}
