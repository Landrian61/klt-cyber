"use client";

import { ActionButton } from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number; // 1-based
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

// Offset pagination (INTERFACE_SPEC §1.3): the page numbers are "reference
// numbers" set in the mono face. Previous/Next are neutral row actions,
// disabled at the bounds. Renders nothing for a single page.
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <p className="font-body text-sm text-on-surface-variant">
        Page <span className="font-mono">{page}</span> of{" "}
        <span className="font-mono">{pageCount}</span>
      </p>
      <div className="flex items-center gap-2">
        <ActionButton
          variant="neutral"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </ActionButton>
        <ActionButton
          variant="neutral"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          Next
        </ActionButton>
      </div>
    </div>
  );
}
