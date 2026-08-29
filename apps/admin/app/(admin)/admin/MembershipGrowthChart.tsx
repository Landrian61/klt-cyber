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

type VerifiedProfile = { verifiedAt?: number };

const MONTH_LABELS = [
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

function bucketByMonth(profiles: VerifiedProfile[]) {
  const now = new Date();
  const months: { label: string; monthStart: Date; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: MONTH_LABELS[d.getMonth()], monthStart: d, count: 0 });
  }
  const verifiedDates = profiles
    .map((p) => p.verifiedAt)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);

  for (const month of months) {
    const cutoff = new Date(
      month.monthStart.getFullYear(),
      month.monthStart.getMonth() + 1,
      1,
    ).getTime();
    month.count = verifiedDates.filter((v) => v < cutoff).length;
  }
  return months.map(({ label, count }) => ({ label, count }));
}

const MembershipGrowthChartBody = dynamic(
  () =>
    import("./MembershipGrowthChartBody").then(
      (m) => m.MembershipGrowthChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function MembershipGrowthChart({
  profiles,
}: {
  profiles: VerifiedProfile[] | null | undefined;
}) {
  const data = useMemo(
    () => (profiles ? bucketByMonth(profiles) : undefined),
    [profiles],
  );

  return (
    <Card className="gap-5 border-t-4 border-t-primary p-6">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Membership Growth
        </CardTitle>
        <CardDescription className="text-sm">
          Cumulative verified members, last 6 months.
        </CardDescription>
      </CardHeader>
      <CardContent className="h-56 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <MembershipGrowthChartBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}
