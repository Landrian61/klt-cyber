"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Id } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { DIMENSIONS, crossTab, getDimension } from "./dimensions";
import type { AnalyticsProfile } from "./demographicsUtils";
import { HeatmapGrid } from "./HeatmapGrid";

const CrossTabBarBody = dynamic(
  () => import("./CrossTabBarBody").then((m) => m.CrossTabBarBody),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

// Above this many values on an axis, a stacked bar's legend/colors stop
// being readable — fall back to a heatmap grid instead (same call already
// made by hand for Ministry Engagement, generalized here into a rule rather
// than a per-chart decision).
const HEATMAP_THRESHOLD = 6;

// Same compact treatment as the Zone 1 filter bar (DashboardFilterBar.tsx) —
// these two pickers sit in the same tab, so they should read as the same
// scale of control, not a full-size form Select next to a dense toolbar.
const COMPACT_TRIGGER =
  "w-40 h-8 px-2.5 py-1 text-xs [&>span]:min-w-0 [&>span]:truncate";

/**
 * "Build your own cross-tab" — pick any two of the 8 filterable dimensions
 * and see the matrix, without waiting on a new chart to be built. Sits
 * alongside the curated charts (Age×Sex, Marital×Sex, Clan×Marital, Age×
 * Department), which keep their hand-tuned captions/colors; this covers
 * every *other* combination generically. Reacts to the same Zone 1-filtered
 * population as the rest of Segment Explorer.
 */
export function CrossTabExplorer({
  profiles,
  clanNameById,
  departmentNameById,
}: {
  profiles: AnalyticsProfile[] | null | undefined;
  clanNameById: Map<Id<"clans">, string>;
  departmentNameById: Map<Id<"departments">, string>;
}) {
  const [rowKey, setRowKey] = useState("department");
  const [colKey, setColKey] = useState("mentorshipStatus");

  const ctx = useMemo(
    () => ({ clanNameById, departmentNameById }),
    [clanNameById, departmentNameById],
  );

  // The column picker already excludes whatever's selected for rows (see its
  // SelectContent below), so this only needs to guard the other direction:
  // picking a row that matches the current column.
  function handleRowChange(newRowKey: string) {
    setRowKey(newRowKey);
    if (colKey === newRowKey) {
      const fallback = DIMENSIONS.find((d) => d.key !== newRowKey);
      if (fallback) setColKey(fallback.key);
    }
  }

  const rowDim = getDimension(rowKey);
  const colDim = getDimension(colKey);

  const result = useMemo(
    () => (profiles ? crossTab(profiles, rowDim, colDim, ctx) : undefined),
    [profiles, rowDim, colDim, ctx],
  );

  const mode =
    result && (result.rows.length > HEATMAP_THRESHOLD || result.cols.length > HEATMAP_THRESHOLD)
      ? "heatmap"
      : "bar";

  return (
    <Card className="gap-5 p-6 lg:col-span-2">
      <CardHeader className="flex-col items-start gap-3 p-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Custom Cross-Tab
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            Pick any two dimensions to answer a question the charts above
            don&apos;t already cover.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <p className="font-body text-xs uppercase tracking-wide text-outline">
              Rows
            </p>
            <Select value={rowKey} onValueChange={handleRowChange}>
              <SelectTrigger className={COMPACT_TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIMENSIONS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="pb-1.5 font-body text-xs text-on-surface-variant">
            by
          </span>
          <div className="space-y-1">
            <p className="font-body text-xs uppercase tracking-wide text-outline">
              Columns
            </p>
            <Select value={colKey} onValueChange={setColKey}>
              <SelectTrigger className={COMPACT_TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIMENSIONS.filter((d) => d.key !== rowKey).map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {result === undefined ? (
          <Skeleton className="h-72 w-full rounded-lg" />
        ) : mode === "bar" ? (
          <div className="h-72">
            <CrossTabBarBody rows={result.rows} cols={result.cols} matrix={result.matrix} />
          </div>
        ) : (
          <HeatmapGrid
            rowLabels={result.rows}
            colLabels={result.cols}
            matrix={result.matrix}
          />
        )}
      </CardContent>
    </Card>
  );
}
