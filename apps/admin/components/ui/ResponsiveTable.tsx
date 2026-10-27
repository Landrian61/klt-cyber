"use client";

import type { ReactNode } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

export interface ResponsiveTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  /** The same row, as a card, for widths below `md`. */
  card: (row: Row) => ReactNode;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
  skeletonRows?: number;
}

/**
 * One set of rows, rendered as a real table on a desktop and as stacked cards
 * on a phone (spec 0012, AC-6).
 *
 * The phone rule is a property of this component rather than of each page, so
 * satisfying it once satisfies it for every department and every bespoke portal
 * that mounts the shared pages. A table squeezed into 375 pixels either scrolls
 * sideways — which hides the column that matters — or shrinks the text past
 * reading; a card per row does neither.
 *
 * Both branches are rendered and one is hidden with a media query rather than
 * being chosen in JavaScript, so the right one is correct in the server-rendered
 * HTML and nothing shifts after hydration.
 */
export function ResponsiveTable<Row>({
  columns,
  rows,
  rowKey,
  card,
  onRowClick,
  empty,
  skeletonRows = 5,
}: ResponsiveTableProps<Row>) {
  return (
    <>
      <div className="hidden md:block">
        <DataTable<Row>
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          onRowClick={onRowClick}
          empty={empty}
          skeletonRows={skeletonRows}
        />
      </div>

      <div className="space-y-3 md:hidden">
        {rows === undefined ? (
          Array.from({ length: Math.min(skeletonRows, 3) }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))
        ) : rows.length === 0 ? (
          <div className="flex justify-center py-10">{empty}</div>
        ) : (
          rows.map((row) => (
            <div key={rowKey(row)}>{card(row)}</div>
          ))
        )}
      </div>
    </>
  );
}

/**
 * The card shell the phone branch uses: the "lifted parchment" surface with an
 * ambient shadow and no border, per the No Line Rule.
 */
export function RowCard({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const base =
    "w-full rounded-md border border-border bg-surface-lowest p-4 text-left shadow-e1 transition-colors";
  if (!onClick) {
    return <div className={cn(base, className)}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "hover:bg-surface-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}
