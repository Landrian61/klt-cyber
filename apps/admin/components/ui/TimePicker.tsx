"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];

interface Parsed {
  hour12: number;
  minute: number;
  period: Period;
}

function parse24h(value: string): Parsed | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h24 = Number(match[1]);
  const minute = Number(match[2]);
  const period: Period = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, period };
}

function to24h({ hour12, minute, period }: Parsed): string {
  const h24 = (hour12 % 12) + (period === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDisplay(value: string, showMinutes: boolean): string | null {
  const parsed = parse24h(value);
  if (!parsed) return null;
  return showMinutes
    ? `${parsed.hour12}:${String(parsed.minute).padStart(2, "0")} ${parsed.period}`
    : `${parsed.hour12} ${parsed.period}`;
}

export interface TimePickerProps {
  id?: string;
  value: string; // "HH:mm", 24h — "" = unset
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Minute increment to offer (e.g. 5, 15). Omit for an hour-only picker —
   * used by Weekly Programs, which always runs on the hour; the stored
   * value is still ":00" underneath either way. */
  minuteStep?: number;
}

/**
 * A shadcn Popover + Select time-of-day field — there's no dedicated shadcn
 * "time picker" block, so this composes the same primitives DatePicker uses
 * (Popover trigger button, tonal surface, no ring) with Hour/(Minute)/AM-PM
 * Selects inside, rather than a bare `<input type="time">`.
 */
export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Pick a time",
  className,
  minuteStep,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const showMinutes = !!minuteStep && minuteStep > 0;
  const display = formatDisplay(value, showMinutes);
  const parsed = parse24h(value) ?? { hour12: 9, minute: 0, period: "AM" as Period };
  const minutes = showMinutes
    ? Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)
    : [];

  function update(partial: Partial<Parsed>) {
    const next = { ...parsed, ...partial };
    // Hour-only mode always normalizes to :00, even for a value parsed from
    // a legacy/foreign non-zero-minute string.
    if (!showMinutes) next.minute = 0;
    onChange(to24h(next));
  }

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
            !display && "text-outline",
            className,
          )}
        >
          <Clock className="h-4 w-4 shrink-0 text-on-surface-variant" />
          {display ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex items-center gap-2">
          <Select
            value={String(parsed.hour12)}
            onValueChange={(v) => update({ hour12: Number(v) })}
          >
            <SelectTrigger className="w-[68px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showMinutes && (
            <>
              <span className="font-body text-sm text-on-surface-variant">:</span>
              <Select
                value={String(parsed.minute).padStart(2, "0")}
                onValueChange={(v) => update({ minute: Number(v) })}
              >
                <SelectTrigger className="w-[68px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {minutes.map((m) => (
                    <SelectItem key={m} value={String(m).padStart(2, "0")}>
                      {String(m).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Select
            value={parsed.period}
            onValueChange={(v) => update({ period: v as Period })}
          >
            <SelectTrigger className="w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
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
  minuteStep?: number;
}

/** Start + end TimePicker side by side. End is clearable (optional); start isn't. */
export function TimeRangeField({
  startId,
  endId,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  disabled,
  minuteStep,
}: TimeRangeFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <TimePicker
        id={startId}
        value={startValue}
        onChange={onStartChange}
        disabled={disabled}
        placeholder="Start time"
        className="flex-1"
        minuteStep={minuteStep}
      />
      <span className="shrink-0 font-body text-sm text-on-surface-variant">to</span>
      <TimePicker
        id={endId}
        value={endValue}
        onChange={onEndChange}
        disabled={disabled}
        placeholder="End time"
        className="flex-1"
        minuteStep={minuteStep}
      />
      {endValue && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onEndChange("")}>
          Clear
        </Button>
      )}
    </div>
  );
}
