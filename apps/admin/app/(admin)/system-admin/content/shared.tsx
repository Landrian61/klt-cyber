"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/shadcn/label";

// Shared helpers for the content-management screens. Content timestamps are
// stored as unix ms; the forms edit them through native date / datetime-local
// inputs, so these converters bridge the two. Times are interpreted in the
// admin's browser-local timezone (fine for a single-site church admin).

/** A thrown mutation's human line — strips Convex's server-error wrapper. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const uncaught = raw.match(/Uncaught (?:Convex)?Error:\s*(.+)/);
  const line = (uncaught?.[1] ?? raw).split("\n")[0]?.trim() ?? "";
  const cleaned = line.replace(/\s+at\s+\S[\s\S]*$/, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** unix ms → "YYYY-MM-DD" (local) for <input type="date">. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → unix ms. `endOfDay` snaps to 23:59:59 for period ends. */
export function fromDateInput(value: string, endOfDay = false): number {
  if (!value) return Number.NaN;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  return new Date(`${value}${suffix}`).getTime();
}

/** unix ms → "YYYY-MM-DDTHH:mm" (local) for <input type="datetime-local">. */
export function toDateTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → unix ms. */
export function fromDateTimeInput(value: string): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

/** "12 Jul 2026" */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "12 Jul 2026, 20:00" */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A labelled form field wrapper. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 font-body text-xs text-outline">{hint}</p>}
    </div>
  );
}

/** Minimal checkbox + label row for boolean flags (active, featured). */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[color:var(--color-primary)]"
      />
      <span className="font-body text-sm text-on-surface">{label}</span>
    </label>
  );
}

/** A compact list row shell used across the managers. */
export function ContentRow({
  title,
  meta,
  badges,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-surface-lowest px-4 py-3 shadow-e1">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-body text-sm font-semibold text-on-surface">
            {title}
          </p>
          {badges}
        </div>
        {meta && (
          <p className="mt-0.5 font-body text-xs text-on-surface-variant">
            {meta}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
