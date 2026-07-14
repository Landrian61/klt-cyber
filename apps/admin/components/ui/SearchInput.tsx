"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  defaultValue?: string;
  onDebouncedChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
}

// Debounced search field (INTERFACE_SPEC §1.7 Input Fields): same minimalist
// treatment as Input — transparent, defined by a ghost bottom border that
// turns 2px gold on focus. A magnifier leads; a clear button appears once the
// field has content.
export function SearchInput({
  defaultValue = "",
  onDebouncedChange,
  placeholder = "Search",
  delay = 300,
  className,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const callbackRef = useRef(onDebouncedChange);
  const isFirstRun = useRef(true);

  useEffect(() => {
    callbackRef.current = onDebouncedChange;
  }, [onDebouncedChange]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const timer = setTimeout(() => callbackRef.current(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-outline/25 transition-colors focus-within:border-b-2 focus-within:border-primary",
        className,
      )}
    >
      <Magnifier />
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full flex-1 bg-transparent py-3 font-body text-base text-on-surface placeholder:text-outline focus:outline-none"
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:text-on-surface-variant"
        >
          <Cross />
        </button>
      )}
    </div>
  );
}

function Magnifier() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-outline"
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m20 20-4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
