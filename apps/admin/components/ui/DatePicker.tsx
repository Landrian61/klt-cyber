"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Calendar } from "@/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { TimePicker } from "@/components/ui/TimePicker";
import { cn } from "@/lib/utils";

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Local midnight for a calendar Date — matches how react-day-picker hands
 * back selections, so round-tripping through unix ms never drifts a day. */
const atMidnight = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export interface DatePickerProps {
  id?: string;
  value?: number; // unix ms, local midnight
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A shadcn Popover + Calendar date field — the admin norm's shadcn-first
 * replacement for a native <input type="date">. Operates directly on unix ms
 * so forms don't need a string round-trip. Styled to match SelectTrigger
 * (tonal surface, no ring) since it's the same "trigger a picker" affordance.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value !== undefined ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-start gap-2 rounded-md bg-surface-low px-3 font-body text-base font-normal text-on-surface hover:bg-surface-low hover:brightness-95",
            !selected && "text-outline",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-on-surface-variant" />
          {selected ? fmt(value!) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? atMidnight(date) : undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateTimePickerProps {
  id?: string;
  value?: number; // unix ms
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
}

/**
 * DatePicker (calendar popover) + a time-of-day field side by side — the
 * shadcn-composed replacement for <input type="datetime-local">. Splits date
 * and time into two controls rather than building a bespoke calendar with an
 * embedded clock; combines them back into one unix-ms value. The time field
 * is the shared TimePicker (Popover + Select), hour-only — same as Weekly
 * Programs' picker (TimePicker still supports a `minuteStep` for finer
 * timing, just unused here).
 */
export function DateTimePicker({
  id,
  value,
  onChange,
  disabled,
}: DateTimePickerProps) {
  const date = value !== undefined ? new Date(value) : undefined;
  const time =
    date === undefined
      ? ""
      : `${String(date.getHours()).padStart(2, "0")}:${String(
          date.getMinutes(),
        ).padStart(2, "0")}`;

  function setDatePart(dayMs: number | undefined) {
    if (dayMs === undefined) {
      onChange(undefined);
      return;
    }
    const day = new Date(dayMs);
    const next = date ? new Date(date) : new Date(day);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    if (!date) next.setHours(9, 0, 0, 0); // sensible default time on first pick
    onChange(next.getTime());
  }

  function setTimePart(next: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(next);
    if (!match) return;
    const base = date ? new Date(date) : new Date();
    base.setHours(Number(match[1]), Number(match[2]), 0, 0);
    onChange(base.getTime());
  }

  return (
    <div className="flex gap-2">
      <DatePicker
        id={id}
        value={date ? atMidnight(date) : undefined}
        onChange={setDatePart}
        disabled={disabled}
        className="flex-1"
      />
      <TimePicker
        id={id ? `${id}-time` : undefined}
        value={time}
        onChange={setTimePart}
        disabled={disabled}
        className="w-auto shrink-0"
      />
    </div>
  );
}
