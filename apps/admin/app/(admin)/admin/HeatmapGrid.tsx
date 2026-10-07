"use client";

import { cn } from "@/lib/utils";

// Royal-blue intensity — deliberately a different hue from the gold funnel
// and the primary/royal/neutral marital chart, so heatmap-style charts on
// this dashboard stay visually distinguishable from bar/donut ones without
// leaving the closed palette. Discrete Tailwind opacity-bucket classes, not
// a runtime `bg-royal/${n}` template — Tailwind v4's JIT only compiles class
// strings it can see literally in source, so a dynamic template would
// silently fail to render any fill.
const ROYAL_INTENSITY = [
  "bg-surface-low",
  "bg-royal/15",
  "bg-royal/35",
  "bg-royal/55",
  "bg-royal/80",
] as const;

function intensityClass(count: number, max: number) {
  if (count === 0 || max === 0) return ROYAL_INTENSITY[0];
  const bucket = Math.min(4, Math.ceil((count / max) * 4));
  return ROYAL_INTENSITY[bucket];
}

/**
 * Shared cell-intensity grid behind both Ministry Engagement (fixed age
 * columns) and the Custom Cross-Tab's heatmap mode (arbitrary dimension
 * pairs) — one grid implementation so a future fix to thresholds, palette,
 * or accessibility only has to happen once. `matrix[i][j]` is the count for
 * `rowLabels[i]` × `colLabels[j]`.
 */
export function HeatmapGrid({
  rowLabels,
  colLabels,
  matrix,
}: {
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
}) {
  const maxCount = Math.max(...matrix.flat(), 0);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[36rem] gap-1"
        style={{ gridTemplateColumns: `12rem repeat(${colLabels.length}, 1fr)` }}
      >
        <div />
        {colLabels.map((col) => (
          <div
            key={col}
            className="truncate px-1 text-center font-body text-xs font-medium text-on-surface-variant"
          >
            {col}
          </div>
        ))}

        {rowLabels.map((row, i) => (
          <div key={row} className="contents">
            <div className="truncate py-1 pr-2 font-body text-sm text-on-surface">
              {row}
            </div>
            {colLabels.map((col, j) => {
              const count = matrix[i]?.[j] ?? 0;
              const intense = maxCount > 0 && count / maxCount > 0.5;
              return (
                <div
                  key={col}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-sm border border-border font-mono text-xs",
                    intensityClass(count, maxCount),
                    count === 0
                      ? "text-on-surface-variant"
                      : intense
                        ? "text-surface-lowest"
                        : "text-on-surface",
                  )}
                >
                  {count}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
