"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Shown in the trigger while no option matches `value`. */
  placeholder?: string;
  id?: string;
  error?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

// Custom select (INTERFACE_SPEC §1.7): the native <select> popup is
// OS-chrome and can't be styled, so this is a hand-rolled combobox/listbox
// (WAI-ARIA pattern, no dropdown lib in this app). The closed trigger reads
// as a field — no enclosing box, ghost bottom border turning 2px gold on
// focus/open — and the menu is lifted parchment floating on an ambient
// shadow. Focus stays on the trigger; keyboard drives the highlight via
// aria-activedescendant.
export function Select({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  id,
  error = false,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  /** Next enabled index walking from `from` in `dir`; stays put at the edge. */
  function move(from: number, dir: 1 | -1): number {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function openList() {
    setHighlighted(selectedIndex >= 0 ? selectedIndex : move(-1, 1));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlighted((h) => move(h, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((h) => move(h, -1));
        break;
      case "Home":
        event.preventDefault();
        setHighlighted(move(-1, 1));
        break;
      case "End":
        event.preventDefault();
        setHighlighted(move(options.length, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(highlighted);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && highlighted >= 0) {
      document
        .getElementById(`${listboxId}-${highlighted}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlighted, listboxId]);

  const borderClass = error
    ? "border-b-2 border-error"
    : open
      ? "border-b-2 border-primary"
      : "border-b border-outline/25 focus-within:border-b-2 focus-within:border-primary";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className={cn("flex items-center transition-colors", borderClass)}>
        <button
          type="button"
          id={id}
          data-field
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={
            open && highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined
          }
          aria-label={ariaLabel}
          aria-invalid={error || undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex w-full items-center justify-between gap-2 bg-transparent py-3 text-left font-body text-base focus:outline-none disabled:opacity-50",
            selected ? "text-on-surface" : "text-outline",
          )}
        >
          <span className="min-w-0 truncate">
            {selected?.label ?? placeholder}
          </span>
          <Chevron open={open} />
        </button>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-lg bg-surface-lowest py-1.5 shadow-[0_8px_32px_rgba(28,28,24,0.12)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onPointerMove={() => {
                  if (!option.disabled && highlighted !== index) {
                    setHighlighted(index);
                  }
                }}
                onClick={() => choose(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 font-body text-sm transition-colors",
                  option.disabled
                    ? "cursor-not-allowed text-outline"
                    : highlighted === index
                      ? "bg-surface-low text-on-surface"
                      : "text-on-surface",
                  isSelected && "font-medium text-primary",
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected && <Check />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        "shrink-0 text-outline transition-transform duration-150",
        open && "rotate-180",
      )}
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-primary"
    >
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
