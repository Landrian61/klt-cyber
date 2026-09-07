"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Filter row (INTERFACE_SPEC §1.7 Badges & Pills, Segmented Controls, Text
// Link): tonal pills and a gold-gradient segmented control, each with a
// hairline border (Hairline Border Rule).

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
  /** "sm" is opt-in — every existing caller keeps today's size unless it
   * asks for the compact one (used by the dashboard's dense filter bar). */
  size?: "default" | "sm";
}

export function FilterChip({
  selected,
  onClick,
  children,
  size = "default",
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border border-border font-body font-medium transition-colors",
        size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
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
  /** "sm" is opt-in — see FilterChip's `size` for why. */
  size?: "default" | "sm";
}

export function SegmentedFilter({
  options,
  value,
  onChange,
  ariaLabel,
  size = "default",
}: SegmentedFilterProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-full border border-border bg-surface-low",
        size === "sm" ? "p-0.5" : "p-1",
      )}
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
              "rounded-full font-body font-medium transition-colors",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm",
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
