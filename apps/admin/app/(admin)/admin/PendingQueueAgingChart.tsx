"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";

type AgingProfile = { _creationTime: number };

const BUCKETS = [
  { label: "0-2 days", min: 0, max: 2 },
  { label: "3-5 days", min: 3, max: 5 },
  { label: "6-10 days", min: 6, max: 10 },
  { label: "10+ days", min: 11, max: Infinity },
];

function bucketByAge(profiles: AgingProfile[]) {
  const now = Date.now();
  const counts = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const p of profiles) {
    const daysWaiting = Math.floor(
      (now - p._creationTime) / (1000 * 60 * 60 * 24),
    );
    const bucketIndex = BUCKETS.findIndex(
      (b) => daysWaiting >= b.min && daysWaiting <= b.max,
    );
    if (bucketIndex !== -1) counts[bucketIndex].count += 1;
  }
  return counts;
}

const PendingQueueAgingChartBody = dynamic(
  () =>
    import("./PendingQueueAgingChartBody").then(
      (m) => m.PendingQueueAgingChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function PendingQueueAgingChart({
  profiles,
}: {
  profiles: AgingProfile[] | null | undefined;
}) {
  const data = useMemo(
    () => (profiles ? bucketByAge(profiles) : undefined),
    [profiles],
  );

  return (
    <Card className="gap-5 p-6">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Pending Queue Aging
        </CardTitle>
        <p className="font-body text-sm text-on-surface-variant">
          Which pending profiles need attention today?
        </p>
      </CardHeader>
      <CardContent className="h-52 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <PendingQueueAgingChartBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}
