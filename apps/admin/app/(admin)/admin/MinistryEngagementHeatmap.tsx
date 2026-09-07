"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";
import { AGE_BUCKETS, type AgeByDepartmentRow } from "./demographicsUtils";
import { HeatmapGrid } from "./HeatmapGrid";

export function MinistryEngagementHeatmap({
  data,
  className,
}: {
  data: AgeByDepartmentRow[] | null | undefined;
  className?: string;
}) {
  return (
    <Card className={cn("gap-5 p-6", className)}>
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Ministry Engagement
        </CardTitle>
        <p className="font-body text-sm text-on-surface-variant">
          Age bracket × department — where is each age group actually
          serving?
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {data === undefined || data === null ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : (
          <HeatmapGrid
            rowLabels={data.map((row) => row.department)}
            colLabels={AGE_BUCKETS.map((b) => b.label)}
            matrix={data.map((row) => row.counts)}
          />
        )}
      </CardContent>
    </Card>
  );
}
