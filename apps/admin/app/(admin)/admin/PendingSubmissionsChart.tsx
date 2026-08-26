"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";

type PendingProfile = { _creationTime: number };

// Buckets currently-pending submissions by the day they came in, for the
// last 7 days. Note: this only reflects profiles still awaiting review —
// once a profile is verified it leaves listPendingVerifications, so this is
// NOT a full historical count of everyone who has ever submitted, just
// today's backlog broken down by day of arrival.
function bucketByDay(profiles: PendingProfile[]) {
  const days: { label: string; date: Date; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: d,
      count: 0,
    });
  }
  for (const p of profiles) {
    const created = new Date(p._creationTime);
    created.setHours(0, 0, 0, 0);
    const bucket = days.find((d) => d.date.getTime() === created.getTime());
    if (bucket) bucket.count += 1;
  }
  return days.map(({ label, count }) => ({ label, count }));
}

// The chart body carries recharts (~103 KB gzip, used by no other route), so
// it loads on demand rather than sitting in /admin's entry graph. `ssr: false`
// because recharts measures the DOM to size itself — there is nothing useful
// to render on the server. The fallback is the same skeleton the `undefined`
// data state already uses, and CardContent below fixes the box at h-56, so the
// deferred load costs latency without shifting layout.
const PendingSubmissionsChartBody = dynamic(
  () =>
    import("./PendingSubmissionsChartBody").then(
      (m) => m.PendingSubmissionsChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function PendingSubmissionsChart({
  profiles,
}: {
  /**
   * `undefined` while the query loads; `null` when it resolved
   * unauthenticated (the sign-out teardown window). Both render as loading.
   */
  profiles: PendingProfile[] | null | undefined;
}) {
  const data = useMemo(
    () => (profiles ? bucketByDay(profiles) : undefined),
    [profiles],
  );

  return (
    <Card className="gap-5 p-6">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Pending Submissions by Day
        </CardTitle>
        <CardDescription className="text-sm">
          Currently-pending profiles, grouped by the day they were submitted
          (last 7 days). Profiles already verified aren&apos;t counted here.
        </CardDescription>
      </CardHeader>

      <CardContent className="h-56 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <PendingSubmissionsChartBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}
