"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

// Axis/label styling is driven by the design tokens rather than raw hex so the
// chart shifts with the palette. Recharts needs inline values, not classes.
const axisTick = {
  fontSize: 12,
  fontFamily: "var(--font-body)",
  fill: "var(--color-on-surface-variant)",
};

export function PendingSubmissionsChart({
  profiles,
}: {
  profiles: PendingProfile[] | undefined;
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ ...axisTick, fontFamily: "var(--font-mono)" }}
                width={24}
              />
              <Tooltip
                cursor={{ fill: "var(--color-surface-low)" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  backgroundColor: "var(--color-surface-lowest)",
                  boxShadow: "0 16px 40px -12px rgba(28, 28, 24, 0.22)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-on-surface)" }}
                itemStyle={{ color: "var(--color-on-surface-variant)" }}
              />
              <Bar
                dataKey="count"
                fill="var(--color-primary)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
