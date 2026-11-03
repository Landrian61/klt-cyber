"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ArrowDownLeft, ArrowUpRight, Package } from "lucide-react";
import {
  LIBRARY_LOW_STOCK_THRESHOLD,
  LIBRARY_STOCK_NOTE_MAX_LENGTH,
  formatUgx,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SearchInput } from "@/components/ui/SearchInput";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Reveal } from "@/components/motion/Reveal";
import { Field } from "@/lib/content-helpers";
import { churchDateTimeLabel } from "@/lib/churchTime";
import { libraryError } from "./libraryErrors";

/**
 * The Library's stock, item by item (spec 0015, AC-22 to AC-25).
 *
 * Physical items only, because only they have a count: a PDF has no shelf.
 * Picking one opens its movement history, newest first, with who recorded each
 * one — a count nobody can account for is a count nobody trusts, so the
 * history is the point of this page rather than a footnote to it.
 *
 * The count itself is never typed in. It changes only by recording a movement,
 * which is the invariant the whole table rests on: `recordStockMovement` is
 * the only writer of `quantityOnHand`, so every number here has a reason
 * behind it.
 */

const PAGE_STEP = 50;

export function LibraryStockPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"libraryItems"> | null>(null);

  const items = useAuthQuery(api.library.listItemsForTeam, {
    ...(search.trim() ? { search: search.trim() } : {}),
    format: "physical" as const,
    includeHidden: true,
  });

  const selected = items?.find((item) => item._id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Heading as="h1" size="xl">
          Stock
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          What is on the shelf, and every movement behind it. Everyone on the
          Library team is told when something drops to{" "}
          <span className="font-mono">{LIBRARY_LOW_STOCK_THRESHOLD}</span> or
          fewer.
        </p>
      </header>

      <SearchInput
        onDebouncedChange={setSearch}
        placeholder="Search by title or author"
        className="max-w-md"
      />

      {items === null ? (
        <ErrorState />
      ) : items === undefined ? (
        <ListPageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package className="size-10" aria-hidden="true" />}
          title={
            search.trim() ? "Nothing matches that" : "Nothing physical yet"
          }
          message={
            search.trim()
              ? "Try a shorter search."
              : "Add a book or some merchandise on the Catalogue page and its stock shows up here."
          }
        />
      ) : (
        <Reveal as="section" className="flex flex-col gap-3">
          {items.map((item) => (
            <article
              key={item._id}
              className="rounded-md border border-border bg-surface-lowest p-4 shadow-e1"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-semibold text-on-surface">
                    {item.title}
                    {item.hidden && (
                      <span className="ml-2 align-middle">
                        <Badge variant="neutral">Hidden</Badge>
                      </span>
                    )}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    {item.priceUgx === null ? "No price" : formatUgx(item.priceUgx)}
                    {item.categoryName ? ` · ${item.categoryName}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-right">
                    <span className="block font-mono text-lg font-semibold text-on-surface">
                      {item.quantityOnHand ?? 0}
                    </span>
                    <span className="block font-body text-[11px] uppercase tracking-[0.12em] text-outline">
                      on hand
                    </span>
                  </span>
                  {(item.quantityOnHand ?? 0) === 0 ? (
                    <Badge variant="rejected">Out of stock</Badge>
                  ) : item.lowStock ? (
                    <Badge variant="pending">Running low</Badge>
                  ) : null}
                  <ActionButton
                    variant="neutral"
                    onClick={() =>
                      setSelectedId(selectedId === item._id ? null : item._id)
                    }
                    aria-expanded={selectedId === item._id}
                  >
                    {selectedId === item._id ? "Close" : "Movements"}
                  </ActionButton>
                </div>
              </div>

              {selectedId === item._id && (
                <StockPanel
                  itemId={item._id}
                  title={item.title}
                  quantityOnHand={item.quantityOnHand ?? 0}
                />
              )}
            </article>
          ))}
        </Reveal>
      )}

      {selected === null && selectedId !== null && (
        // The item vanished under an open panel: another operator removed it,
        // or a filter stopped matching it. Say so rather than leaving a panel
        // attached to nothing.
        <p className="font-body text-sm text-on-surface-variant">
          That item is no longer in this list.
        </p>
      )}
    </div>
  );
}

/** One item's movement recorder and its history. */
function StockPanel({
  itemId,
  title,
  quantityOnHand,
}: {
  itemId: Id<"libraryItems">;
  title: string;
  quantityOnHand: number;
}) {
  const recordStockMovement = useMutation(api.library.recordStockMovement);

  const [limit, setLimit] = useState(PAGE_STEP);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const history = useAuthQuery(api.library.listStockMovements, {
    itemId,
    limit,
  });

  async function record(direction: "in" | "out") {
    setError(null);
    setDone(null);

    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return setError("Enter a whole number above zero.");
    }

    setSaving(true);
    try {
      const result = await recordStockMovement({
        itemId,
        direction,
        quantity: parsed,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setQuantity("");
      setNote("");
      setDone(
        result.lowStockAlerted
          ? `Recorded. ${title} is down to ${result.quantityAfter}, and the team has been told.`
          : `Recorded. ${title} is now at ${result.quantityAfter}.`,
      );
    } catch (mutationError) {
      setError(libraryError(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-md bg-surface-low p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="How many"
          htmlFor={`stock-quantity-${itemId}`}
          className="w-28"
        >
          <Input
            id={`stock-quantity-${itemId}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="1"
          />
        </Field>

        <Field
          label="Why (optional)"
          htmlFor={`stock-note-${itemId}`}
          className="min-w-[14rem] flex-1"
        >
          <Input
            id={`stock-note-${itemId}`}
            value={note}
            maxLength={LIBRARY_STOCK_NOTE_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. sold at the Sunday service"
          />
        </Field>

        <div className="flex items-center gap-2 pb-0.5">
          <Button size="sm" loading={saving} onClick={() => record("in")}>
            <ArrowDownLeft className="size-4" aria-hidden="true" />
            Came in
          </Button>
          <ActionButton
            variant="danger"
            loading={saving}
            disabled={quantityOnHand === 0}
            onClick={() => record("out")}
          >
            <ArrowUpRight className="size-4" aria-hidden="true" />
            Went out
          </ActionButton>
        </div>
      </div>

      {error && (
        <p role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="font-body text-sm text-success">
          {done}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-body text-[11px] font-semibold uppercase tracking-[0.12em] text-outline">
          Movements
        </h3>

        {history === null ? (
          <ErrorState />
        ) : history === undefined ? (
          <p className="font-body text-sm text-outline" aria-busy="true">
            Loading…
          </p>
        ) : history.movements.length === 0 ? (
          <p className="font-body text-sm text-outline">
            Nothing recorded yet.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {history.movements.map((movement) => (
                <li
                  key={movement._id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-body text-sm"
                >
                  <span
                    className={
                      movement.direction === "in"
                        ? "font-mono font-semibold text-success"
                        : "font-mono font-semibold text-crimson"
                    }
                  >
                    {movement.direction === "in" ? "+" : "−"}
                    {movement.quantity}
                  </span>
                  <span className="font-mono text-on-surface-variant">
                    → {movement.quantityAfter}
                  </span>
                  <span className="text-on-surface-variant">
                    {movement.actorName}
                  </span>
                  <span className="font-mono text-xs text-outline">
                    {churchDateTimeLabel(movement.createdAt)}
                  </span>
                  {movement.note && (
                    <span className="text-outline">{movement.note}</span>
                  )}
                </li>
              ))}
            </ul>

            {history.hasMore && (
              <ActionButton
                variant="neutral"
                className="self-start"
                onClick={() => setLimit((current) => current + PAGE_STEP)}
              >
                Load more
              </ActionButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}
