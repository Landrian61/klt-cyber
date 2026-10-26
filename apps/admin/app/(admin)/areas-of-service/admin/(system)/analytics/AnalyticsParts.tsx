"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";
import { Heading } from "@/components/ui/Heading";

/**
 * The small visual pieces the analytics page is built from (spec 0011).
 *
 * Every one of them exists to answer a question faster than a bare number
 * does. A count on its own says "41 people were active"; a bar against the
 * accounts that exist says "41 of 98, and that is less than half", which is
 * the sentence somebody actually makes a decision from.
 *
 * Two rules hold throughout. Nothing here invents a denominator: a proportion
 * is drawn only when the page genuinely has the whole to divide by, and
 * otherwise the figure stands alone. And crimson is never decorative — it
 * marks a thing that is wrong, so a page with no crimson on it can be trusted
 * to mean nothing is.
 */

// ── Tiles ─────────────────────────────────────────────────────────────────

export type TileTone = "neutral" | "gold" | "royal" | "crimson";

const TILE_TONES: Record<TileTone, { tile: string; icon: string }> = {
  neutral: { tile: "bg-surface-lowest", icon: "bg-surface-high text-on-surface-variant" },
  gold: { tile: "bg-primary-light border-primary/30", icon: "bg-primary/15 text-primary" },
  royal: { tile: "bg-royal-light border-royal/25", icon: "bg-royal/15 text-royal" },
  crimson: { tile: "bg-crimson-light border-crimson/30", icon: "bg-crimson/15 text-crimson" },
};

/**
 * One measurement: an icon, a label, a number set in the mono face, and
 * optionally something underneath that gives the number its scale.
 *
 * The icon is `aria-hidden` and carries no information the label does not
 * already give, which is what keeps it decoration rather than a thing a
 * screen reader has to narrate.
 */
export function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  /** A number animates on first paint; anything else renders as given. */
  value: number | ReactNode;
  hint?: ReactNode;
  tone?: TileTone;
  children?: ReactNode;
  className?: string;
}) {
  const tones = TILE_TONES[tone];

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-border p-5 shadow-e1",
        tones.tile,
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn("flex size-8 items-center justify-center rounded-md", tones.icon)}
          aria-hidden
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <p className="font-body text-sm text-on-surface-variant">{label}</p>
      </div>

      <p className="mt-3 font-mono text-4xl font-bold leading-none text-on-surface">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </p>

      {hint && (
        <p className="mt-1.5 font-body text-xs text-on-surface-variant">{hint}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ── Proportion visuals ────────────────────────────────────────────────────

/**
 * One bar split into named parts, with its legend beneath.
 *
 * Used where a total divides cleanly and the split is the point: visitors
 * against members, Android against iPhone. The segments are drawn from the
 * values themselves, so a part that is zero simply takes no width rather than
 * leaving a sliver that implies somebody is there.
 */
export function SplitBar({
  segments,
}: {
  segments: { label: string; value: number; tone: "gold" | "royal" | "muted" }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const fills: Record<string, string> = {
    gold: "bg-primary",
    royal: "bg-royal",
    muted: "bg-outline/50",
  };

  return (
    <div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface-high"
        role="presentation"
      >
        {total > 0 &&
          segments.map((segment) => (
            <div
              key={segment.label}
              className={fills[segment.tone]}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="flex items-center gap-1.5 font-body text-xs text-on-surface-variant"
          >
            <span
              className={cn("size-2 rounded-full", fills[segment.tone])}
              aria-hidden
            />
            {segment.label}
            <span className="font-mono font-semibold text-on-surface">
              {segment.value.toLocaleString("en-US")}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Usage against an allowance: the "this is about to start costing money" read.
 *
 * Only ever drawn when the allowance is actually recorded in the cost
 * register. Without one there is no denominator, and a meter with an invented
 * ceiling would be worse than the bare number — it would look like a fact.
 *
 * The bar turns gold past three quarters and crimson once it is full, because
 * those are the two moments the reader has to do something.
 */
export function Meter({
  used,
  allowance,
  usedLabel,
  allowanceLabel,
}: {
  used: number;
  allowance: number | null;
  usedLabel: string;
  allowanceLabel: string;
}) {
  if (allowance === null || allowance <= 0) {
    return (
      <p className="font-body text-xs italic text-outline">
        No allowance recorded, so there is nothing to measure this against. Add
        one on the Costs page.
      </p>
    );
  }

  const fraction = used / allowance;
  const percent = Math.round(fraction * 100);
  const tone =
    fraction >= 1 ? "bg-crimson" : fraction >= 0.75 ? "bg-primary" : "bg-royal";

  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-high">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${Math.min(fraction * 100, 100)}%` }}
        />
      </div>
      <p className="mt-2 font-body text-xs text-on-surface-variant">
        <span className="font-mono font-semibold text-on-surface">
          {usedLabel}
        </span>{" "}
        of {allowanceLabel} used
        <span className="ml-1.5 text-outline">({percent}%)</span>
      </p>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────

/** A panel that groups a visual with its own heading. */
export function Panel({
  title,
  icon: Icon,
  footnote,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface-lowest p-5 shadow-e1",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 items-center justify-center rounded-md bg-surface-high text-on-surface-variant"
          aria-hidden
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <p className="font-body text-sm font-semibold text-on-surface">
          {title}
        </p>
      </div>
      <div className="mt-4">{children}</div>
      {footnote && (
        <p className="mt-3 font-body text-xs text-outline">{footnote}</p>
      )}
    </div>
  );
}

/** One titled band of the page, with the sentence that explains its window. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <Heading as="h2" size="lg">
          {title}
        </Heading>
        {description && (
          <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
