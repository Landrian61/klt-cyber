"use client";

import { cn } from "@/lib/utils";

export interface TimePickerProps {
  id?: string;
  value: string; // "HH:mm", 24h — empty string = unset
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * A shadcn-styled time-of-day field — formalizes the native
 * `<input type="time">` styling `DateTimePicker` (components/ui/DatePicker.tsx)
 * already uses inline for its time half into a standalone, reusable
 * component, so every plain time field in the admin (not paired with a date)
 * looks consistent rather than each form hand-rolling its own raw input. No
 * Popover/Calendar chrome (unlike DatePicker) — a bare wall-clock time has
 * nothing to pick from visually; the OS/browser-native time UI is the actual
 * interaction, this just matches its chrome to the rest of the form.
 */
export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: TimePickerProps) {
  return (
    <input
      id={id}
      type="time"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-11 w-full rounded-md bg-surface-low px-3 text-center font-body text-base text-on-surface outline-none focus-visible:brightness-95 disabled:opacity-50",
        className,
      )}
    />
  );
}

export interface TimeRangeFieldProps {
  startId?: string;
  endId?: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  disabled?: boolean;
}

/** Start + end TimePicker side by side, with an inline separator. */
export function TimeRangeField({
  startId,
  endId,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  disabled,
}: TimeRangeFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <TimePicker
        id={startId}
        value={startValue}
        onChange={onStartChange}
        disabled={disabled}
        aria-label="Start time"
      />
      <span className="shrink-0 font-body text-sm text-on-surface-variant">to</span>
      <TimePicker
        id={endId}
        value={endValue}
        onChange={onEndChange}
        disabled={disabled}
        aria-label="End time"
      />
    </div>
  );
}
