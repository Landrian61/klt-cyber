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
import { Card } from "./ui";

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
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">
        Pending Submissions by Day
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Currently-pending profiles, grouped by the day they were submitted (last
        7 days). Profiles already verified aren&apos;t counted here.
      </p>

      <div className="mt-4 h-56">
        {data === undefined ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                width={24}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="count"
                fill="var(--color-primary)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
