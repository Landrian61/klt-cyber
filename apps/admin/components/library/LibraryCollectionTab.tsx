"use client";

import { FolderTree, HeartPulse, Layers, TrendingUp } from "lucide-react";
import { LIBRARY_ITEM_FORMAT_LABELS } from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import { Reveal } from "@/components/motion/Reveal";
import {
  CHART_HUES,
  Panel,
  PanelChartSkeleton,
  PanelEmpty,
  PanelLines,
  useMinuteClock,
} from "./libraryDashboardParts";
import { LibraryAdditionsChart } from "./LibraryTrendCharts";

/**
 * Collection: what the church holds, and where the catalogue is thin
 * (spec 0017, AC-8 to AC-12).
 *
 * Every figure here counts live items INCLUDING those hidden from members,
 * because this is the team's own view of what they hold (AC-26).
 */

/** The fixed hue order for the three formats. Never cycled, never by rank. */
const FORMAT_HUE: Record<string, string> = {
  physical: CHART_HUES.gold,
  pdf: CHART_HUES.royal,
  audio: CHART_HUES.ink,
};

const HEALTH_LABELS: Record<string, { label: string; chase: string }> = {
  cover: { label: "Carrying a cover", chase: "without a cover image" },
  author: { label: "Naming an author", chase: "without an author or minister" },
  description: {
    label: "Carrying a description",
    chase: "without a description",
  },
};

export function LibraryCollectionTab() {
  const now = useMinuteClock();
  const collection = useAuthQuery(api.library.getLibraryCollection, { now });

  if (collection === null) return <ErrorState />;

  // A trend renders as a chart only once at least one bucket is non zero: a
  // chart of twelve zero bars says "nothing yet" far worse than a sentence
  // does (AC-27).
  const hasAdditions =
    collection !== undefined &&
    collection.monthlyAdditions.some((point) => point.count > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="What we hold" icon={<Layers className="size-4" />}>
          {collection === undefined ? (
            <PanelLines />
          ) : collection.totalItems === 0 ? (
            <PanelEmpty
              title="Nothing in the catalogue yet"
              message="Once you add items, the split between books, PDFs and recordings shows here."
            />
          ) : (
            <Reveal as="div" className="space-y-4">
              {/* A horizontal stacked bar: one segment per format, each with
                  a 2px gap of card surface between it and the next, so two
                  fills never touch and read as one block. The count is the
                  primary number; the share is secondary. */}
              <div
                className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
                role="presentation"
              >
                {collection.formatMix
                  .filter((slice) => slice.count > 0)
                  .map((slice) => (
                    <span
                      key={slice.format}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${(slice.count / collection.totalItems) * 100}%`,
                        backgroundColor: FORMAT_HUE[slice.format],
                      }}
                    />
                  ))}
              </div>

              {/* The legend and the direct labels in one list: identity is
                  never carried by colour alone. */}
              <ul className="space-y-2">
                {collection.formatMix.map((slice) => (
                  <li
                    key={slice.format}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: FORMAT_HUE[slice.format] }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-body text-sm text-on-surface">
                        {LIBRARY_ITEM_FORMAT_LABELS[
                          slice.format as keyof typeof LIBRARY_ITEM_FORMAT_LABELS
                        ] ?? slice.format}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-on-surface">
                      {slice.count}
                      {/* Shares are rounded independently and NOT forced to
                          total a hundred, so a set may honestly read
                          33, 33, 33 (AC-8). */}
                      {slice.share !== null && (
                        <span className="ml-2 text-xs text-on-surface-variant">
                          {slice.share}%
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </Panel>

        <Panel title="By category" icon={<FolderTree className="size-4" />}>
          {collection === undefined ? (
            <PanelLines />
          ) : collection.categories.length === 0 ? (
            <PanelEmpty
              title="No categories in use yet"
              message="Items you file under a category are counted here, busiest first."
            />
          ) : (
            <ul className="space-y-3">
              {collection.categories.map((category) => {
                const busiest = collection.categories[0].count;
                return (
                  <li
                    key={category.categoryId ?? "uncategorised"}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-body text-sm text-on-surface">
                        {category.name}
                      </span>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-on-surface">
                        {category.count}
                      </span>
                    </div>
                    {/* A bar list rather than a chart: the label matters more
                        than the geometry, and a category name needs room. */}
                    <span className="block h-1.5 w-full rounded-full bg-surface-low">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max((category.count / busiest) * 100, 4)}%`,
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Added over the last year"
        icon={<TrendingUp className="size-4" />}
      >
        {collection === undefined ? (
          <PanelChartSkeleton />
        ) : !hasAdditions ? (
          <PanelEmpty
            title="No additions in the last twelve months"
            message="Items you add from now on build this chart, one bar per month."
          />
        ) : (
          <>
            <LibraryAdditionsChart points={collection.monthlyAdditions} />
            <p className="mt-3 font-body text-xs text-outline">
              The newest month is still running, so its bar is partial.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Catalogue health"
        icon={<HeartPulse className="size-4" />}
      >
        {collection === undefined ? (
          <PanelLines />
        ) : // A null share means there was no denominator at all. Rendering a
        // confident 0% or 100% computed from nothing is the failure this
        // guards (AC-12, AC-27).
        collection.health.every((metric) => metric.share === null) ? (
          <PanelEmpty
            title="Nothing to measure yet"
            message="Once the catalogue has items, this shows how many are missing a cover, an author or a description."
          />
        ) : (
          <div className="space-y-5">
            {collection.health.map((metric) => {
              const copy = HEALTH_LABELS[metric.field] ?? {
                label: metric.field,
                chase: `without ${metric.field}`,
              };
              return (
                <div key={metric.field} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-body text-sm text-on-surface">
                      {copy.label}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-on-surface">
                      {metric.share}%
                    </span>
                  </div>
                  <span className="block h-2 w-full rounded-full bg-surface-low">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${metric.share ?? 0}%` }}
                    />
                  </span>
                  <p className="font-body text-xs text-on-surface-variant">
                    {metric.missing === 0
                      ? "Nothing missing — this one is done."
                      : `${metric.missing} ${metric.missing === 1 ? "item" : "items"} ${copy.chase}.`}
                  </p>
                </div>
              );
            })}
            <p className="font-body text-xs text-outline">
              Measured across all {collection.totalItems}{" "}
              {collection.totalItems === 1 ? "item" : "items"} you hold, hidden
              ones included.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
