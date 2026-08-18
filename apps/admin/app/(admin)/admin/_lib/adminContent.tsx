"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/shadcn/label";
import { Badge, type BadgeVariant } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";

// Shared helpers for Administration's Programs & Content / Planning screens
// (Weekly Program, Events, Announcements, Year Planner — docs/Admin_Portal.md).
// Deliberately parallel to apps/admin/app/(admin)/system-admin/content/shared.tsx
// rather than importing it: that module backs the system-wide content-override
// surface under a different route group, and the two are free to diverge.
// Keeping the date/error helpers here identical on purpose — same underlying
// Convex fields, same conventions — so behavior doesn't drift by accident.

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

/** "9:00 AM" from a stored 24h "HH:mm". */
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${match[2]} ${period}`;
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

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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

/**
 * Image-led card (docs/Admin-portal.html `.ev-card`) — the shared shell for
 * Events and Announcements. Cover image on top (a gold-toned gradient
 * placeholder when there's none yet), title + meta below, optional corner
 * marker (e.g. a featured star) and badge row.
 */
export function ContentCard({
  coverImageUrl,
  title,
  meta,
  badges,
  marker,
  onClick,
}: {
  coverImageUrl?: string;
  title: string;
  meta?: ReactNode;
  badges?: ReactNode;
  marker?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl bg-surface-lowest text-left shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[image:linear-gradient(135deg,var(--color-primary-container),var(--color-primary))]">
        {coverImageUrl && (
          // Signed R2 URLs change per session/domain — plain <img>, same
          // convention as components/ui/ImageUpload.tsx's own preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        {marker && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#0c1120]/45 px-2 py-1 font-body text-xs font-semibold text-white backdrop-blur-sm">
            {marker}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-body text-sm font-semibold text-on-surface">
            {title}
          </p>
        </div>
        {meta && (
          <p className="font-body text-xs text-on-surface-variant">{meta}</p>
        )}
        {badges && <div className="flex flex-wrap items-center gap-1.5 pt-0.5">{badges}</div>}
      </div>
    </button>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

/** Announcement priority → tonal badge. Crimson marks "high" (spec: priority). */
export function PriorityBadge({ priority }: { priority?: "low" | "normal" | "high" }) {
  if (priority === "high") {
    return (
      <span
        className={cn(
          "inline-flex h-[22px] items-center rounded-full bg-crimson-light px-2.5 font-body text-xs font-semibold text-crimson",
        )}
      >
        High priority
      </span>
    );
  }
  if (priority === "low") {
    return <Badge variant="neutral">Low priority</Badge>;
  }
  return <Badge variant="neutral">Normal priority</Badge>;
}

const ACTIVITY_STATUS: Record<
  "planned" | "in_progress" | "done",
  { label: string; variant: BadgeVariant }
> = {
  planned: { label: "Planned", variant: "pending" },
  in_progress: { label: "In progress", variant: "role" },
  done: { label: "Done", variant: "verified" },
};

export function ActivityStatusBadge({
  status,
}: {
  status: "planned" | "in_progress" | "done";
}) {
  const { label, variant } = ACTIVITY_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export const ACTIVITY_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;
