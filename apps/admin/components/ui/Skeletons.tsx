import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

/*
  Route-level loading skeletons.

  Every admin route is server-rendered on demand, so between a navigation and
  the first client render there was nothing on screen at all: no loading.tsx
  anywhere, and eight <Suspense> boundaries that all passed fallback={null}.
  These give that window a shape.

  Two rules keep them honest:

  1. They are built from the same primitives as the real screens — Table,
     THead/TR/TH/TD, the same grid classes, the same spacing — so the skeleton
     and the content it replaces occupy the same box and nothing reflows when
     the swap happens.
  2. The bar treatment matches DataTable's existing `rows === undefined` state
     (`h-4 rounded-sm bg-surface-low`) rather than introducing a second
     loading vocabulary. Larger blocks use the shadcn `Skeleton` default.

  Server components — no "use client" — so they cost nothing on the client and
  can be used directly as a `loading.tsx` default export.
*/

/** A table-cell bar, matching DataTable's skeleton treatment exactly. */
function CellBar({ className }: { className?: string }) {
  return <Skeleton className={`h-4 rounded-sm bg-surface-low ${className ?? ""}`} />;
}

/** Page title + supporting line, matching the standard admin page header. */
export function PageHeaderSkeleton({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <header className="space-y-1">
      {/* matches Heading size="2xl" (text-4xl) */}
      <Skeleton className="h-9 w-56" />
      {subtitle && <Skeleton className="mt-2 h-5 w-72 bg-surface-low" />}
    </header>
  );
}

/** Search field + trailing actions row. */
export function ToolbarSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-9 min-w-64 flex-1 rounded-md" />
      {Array.from({ length: actions }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-32 rounded-md" />
      ))}
    </div>
  );
}

/**
 * A table in its real shell (hairline border + shadow-e1), with placeholder
 * head and body cells at the real padding.
 */
export function TableSkeleton({
  columns = 5,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <Table>
      <THead>
        <TR>
          {Array.from({ length: columns }).map((_, i) => (
            <TH key={i}>
              <CellBar className="w-20" />
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TR key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <TD key={c}>
                <CellBar />
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Grid of lifted stat cards, matching StatCard / the dashboard's StatTile. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-surface-lowest p-6 shadow-e1"
        >
          <Skeleton className="h-4 w-24 bg-surface-low" />
          <Skeleton className="mt-3 h-9 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A lifted content card of a given height — for panels and editor surfaces. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-md border border-border bg-surface-lowest p-6 shadow-e1 ${className ?? ""}`}
    >
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-4 w-full bg-surface-low" />
      <Skeleton className="mt-2 h-4 w-4/5 bg-surface-low" />
    </div>
  );
}

/**
 * The shape almost every admin screen takes: header, toolbar, table. Used
 * both as a route `loading.tsx` and as the <Suspense> fallback on the pages
 * whose client reads useSearchParams.
 */
export function ListPageSkeleton({
  columns = 5,
  rows = 5,
  actions = 1,
}: {
  columns?: number;
  rows?: number;
  actions?: number;
}) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <ToolbarSkeleton actions={actions} />
      <TableSkeleton columns={columns} rows={rows} />
    </div>
  );
}
