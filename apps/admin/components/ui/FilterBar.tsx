"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Filter row (INTERFACE_SPEC §1.7 Badges & Pills, Segmented Controls, Text
// Link): tonal pills and a gold-gradient segmented control — separation by
// background shift, never a border.

export interface FilterBarProps {
  children: ReactNode;
  onClearAll?: () => void;
  showClear?: boolean;
  className?: string;
}

export function FilterBar({
  children,
  onClearAll,
  showClear = false,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {showClear && (
        <button
          type="button"
          onClick={onClearAll}
          className="font-body text-sm font-medium text-primary underline underline-offset-2 transition-colors hover:text-brand"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export interface FilterChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function FilterChip({ selected, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-9 rounded-full px-4 font-body text-sm font-medium transition-colors",
        selected
          ? "bg-primary-dim text-primary"
          : "bg-surface-low text-on-surface-variant hover:bg-surface-high",
      )}
    >
      {children}
    </button>
  );
}

export interface SegmentedFilterProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export function SegmentedFilter({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedFilterProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-full bg-surface-low p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "h-8 rounded-full px-4 font-body text-sm font-medium transition-colors",
              active
                ? "bg-[image:linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] text-on-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
