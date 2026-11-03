"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The pieces every Library dashboard tab is built from (spec 0017).
 *
 * One place rather than four copies: the four tabs are different questions
 * about the same shelf, so they should not look like four different products.
 */

/**
 * The clock, advanced once a minute.
 *
 * Lifted deliberately from the shared `DepartmentDashboard` rather than
 * imported from it: the Library dashboard no longer mounts that component, and
 * the reason the clock exists is identical either way. A Convex query cannot
 * re-evaluate a server side `Date.now()`, so a month boundary or a ninety day
 * window would freeze at whatever the time was when the page was opened. The
 * client supplies the instant, the server converts it to Kampala calendar
 * boundaries. Rounded down to the minute so the query re-runs sixty times an
 * hour at most rather than on every tick (AC-25).
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / 60_000) * 60_000),
      30_000,
    );
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The categorical chart palette, in fixed order (INTERFACE_SPEC, plus the
 * `dataviz` colour checks).
 *
 * Gold and Royal Blue are the two brand hues a chart may spend. Crimson is
 * deliberately NOT here: it is the portal's destructive and LIVE colour, and a
 * status colour reused as "series three" makes a quiet audio count look like a
 * problem. The third slot is the warm text ink the portal's existing charts
 * already use as a series colour, which reads as data rather than as alarm.
 *
 * It is lower in chroma than a brand hue, so every segment that uses it also
 * carries its own visible label and a legend swatch: identity on this chart is
 * never colour alone, which is what the colour checks ask for in exchange.
 */
export const CHART_HUES = {
  gold: "var(--color-primary)",
  royal: "var(--color-royal)",
  ink: "var(--color-on-surface-variant)",
} as const;

/** A dashboard panel. The same parchment card the rest of the portal uses. */
export function Panel({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-md border border-border bg-surface-lowest p-5 shadow-e1 ${className ?? ""}`}
    >
      <h3 className="mb-4 flex items-center justify-between gap-2 font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        <span className="flex items-center gap-2">
          {icon && (
            <span className="text-primary" aria-hidden="true">
              {icon}
            </span>
          )}
          {title}
        </span>
        {action}
      </h3>
      {children}
    </section>
  );
}

/** Three loading lines, for a panel whose shape is a list. */
export function PanelLines() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/** A loading block the height of a chart. */
export function PanelChartSkeleton() {
  return <Skeleton className="h-56 w-full rounded-lg" aria-busy="true" />;
}

/**
 * The empty state a panel with nothing to say renders (AC-27).
 *
 * It describes what WILL appear there rather than apologising, because for
 * several of these panels the honest answer for the next few months is "not
 * yet" and a chart of twelve zero bars says that far worse than a sentence
 * does.
 */
export function PanelEmpty({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return <EmptyState title={title} message={message} />;
}

/** A row in one of the plain ranked lists, with its numeral column. */
export function NumeralRow({
  label,
  sublabel,
  value,
  tone,
}: {
  label: string;
  sublabel?: string;
  value: React.ReactNode;
  tone?: "concern";
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate font-body text-sm font-semibold text-on-surface">
          {label}
        </span>
        {sublabel && (
          <span className="block font-body text-xs text-on-surface-variant">
            {sublabel}
          </span>
        )}
      </span>
      <span
        className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
          tone === "concern" ? "text-crimson" : "text-on-surface"
        }`}
      >
        {value}
      </span>
    </li>
  );
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A "YYYY-MM" Kampala month key as a short axis label.
 *
 * January also carries its year, which is how a twelve month axis stays
 * readable without labelling every point: the only place a reader needs the
 * year is where it changes.
 */
export function monthAxisLabel(key: string): string {
  const [year, month] = key.split("-");
  const short = MONTH_SHORT[Number(month) - 1] ?? key;
  return month === "01" ? `${short} ${year.slice(2)}` : short;
}

/** The same key spelled out, for a tooltip where there is room. */
export function monthFullLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_SHORT[Number(month) - 1] ?? key} ${year}`;
}

/**
 * A byte count in binary units (AC-18).
 *
 * KiB and MiB rather than kB and MB, because the number came from R2's own
 * reported object size and binary units are what storage is actually billed
 * and measured in. Saying `KiB` is the honest spelling of a division by 1024.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes read oddly with a decimal; everything larger wants one.
  const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

/**
 * The sentence a trend panel shows when its read hit the movement cap
 * (AC-23).
 *
 * It names the month coverage BEGINS at rather than merely saying "partial",
 * because that first month's own totals are incomplete and the reader has to
 * know which bar to distrust.
 */
export function coverageNote(coverageFrom: string | null): string | null {
  if (!coverageFrom) return null;
  return `There were more movements than this page reads in one go, so coverage starts at ${monthFullLabel(coverageFrom)} — and that month's own totals are incomplete.`;
}
