import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Composable table parts (INTERFACE_SPEC §1.6 tonal layering, §1.7 Editorial
// Card): the table shell reads from a hairline border (Hairline Border Rule)
// plus a whisper of shadow. Inside the shell, rows stay line-free — separated
// by a tonal head background shift and a hover shift, not row dividers.

export function Table({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-surface-lowest shadow-e1",
        className,
      )}
    >
      <table className="w-full text-left">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-low">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  interactive = false,
  onClick,
  className,
  children,
}: {
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        interactive && "cursor-pointer transition-colors hover:bg-surface-low",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  sortable = false,
  sortDirection = null,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
  align?: "left" | "right";
  className?: string;
  children?: ReactNode;
}) {
  const ariaSort = sortable
    ? sortDirection === "asc"
      ? ("ascending" as const)
      : sortDirection === "desc"
        ? ("descending" as const)
        : ("none" as const)
    : undefined;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-4 py-3 font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant",
        align === "right" && "text-right",
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-on-surface",
            align === "right" && "flex-row-reverse",
          )}
        >
          {children}
          <SortIcon direction={sortDirection} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TD({
  align = "left",
  className,
  children,
}: {
  align?: "left" | "right";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 align-middle font-body text-sm text-on-surface",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-outline"
      >
        <path d="M6 2 8.4 4.8H3.6L6 2Z" fill="currentColor" opacity="0.5" />
        <path d="M6 10 3.6 7.2h4.8L6 10Z" fill="currentColor" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn(
        "shrink-0 text-primary transition-transform duration-150",
        direction === "desc" && "rotate-180",
      )}
    >
      <path d="M6 2.5 9.2 7H2.8L6 2.5Z" fill="currentColor" />
    </svg>
  );
}
