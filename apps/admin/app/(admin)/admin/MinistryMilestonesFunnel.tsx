"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

// Gold-intensity progression across the 5 stages — existing tokens only, no
// new colors. Bespoke CSS bars rather than a recharts Funnel: no funnel/
// heatmap primitive has ever been proven in this codebase, and a div-based
// bar guarantees the literal count is always shown as text, not dependent
// on label placement inside a shrinking shape.
const STAGE_FILL = [
  "bg-surface-low",
  "bg-primary-light",
  "bg-primary-dim",
  "bg-primary",
  "bg-primary-container",
];

export function MinistryMilestonesFunnel({
  data,
  completionRate,
}: {
  data: { label: string; count: number }[] | null | undefined;
  completionRate: number | null | undefined;
}) {
  const maxCount = useMemo(
    () => (data ? Math.max(...data.map((d) => d.count), 0) : 0),
    [data],
  );
  const total = useMemo(
    () => (data ? data.reduce((sum, d) => sum + d.count, 0) : 0),
    [data],
  );

  return (
    <Card className="gap-5 p-6">
      <CardHeader className="flex-row items-start justify-between gap-3 p-0">
        <div className="space-y-1">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Ministry Milestones
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            Church-wide progress through the Leadership Institute pipeline —
            one shared journey, not scoped to any single ministry.
          </p>
        </div>
        {completionRate !== undefined && completionRate !== null && (
          <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold text-primary">
            {completionRate}% completed
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {data === undefined || data === null ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {data.map((stage, i) => {
              const widthPct =
                maxCount === 0
                  ? 0
                  : Math.max((stage.count / maxCount) * 100, stage.count === 0 ? 6 : 0);
              const pct = total === 0 ? 0 : Math.round((stage.count / total) * 100);
              return (
                <div
                  key={stage.label}
                  className="grid grid-cols-[7rem_1fr_5.5rem] items-center gap-3"
                >
                  <span className="truncate font-body text-sm font-medium text-on-surface">
                    {stage.label}
                  </span>
                  <div className="h-8 overflow-hidden rounded-md bg-surface-low">
                    <div
                      className={cn(
                        "h-full rounded-md transition-all",
                        STAGE_FILL[i % STAGE_FILL.length],
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="text-right font-mono text-sm font-semibold text-on-surface">
                    {stage.count}{" "}
                    <span className="text-on-surface-variant">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
