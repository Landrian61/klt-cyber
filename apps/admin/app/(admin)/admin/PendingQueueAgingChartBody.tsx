"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axisTick = {
  fontSize: 12,
  fontFamily: "var(--font-body)",
  fill: "var(--color-on-surface-variant)",
};

// Escalating by bucket: healthy → watch → overdue → urgent. Matches the
// bucket order in PendingQueueAgingChart.tsx's BUCKETS array.
const BUCKET_COLORS = [
  "var(--color-success)",
  "var(--color-royal)",
  "var(--color-primary)",
  "var(--color-crimson)",
];

export function PendingQueueAgingChartBody({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  const router = useRouter();

  return (
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
          formatter={(value) => {
            const count = typeof value === "number" ? value : 0;
            return [`${count} profile${count === 1 ? "" : "s"}`, "Waiting"];
          }}
        />
        <Bar
          dataKey="count"
          radius={[6, 6, 0, 0]}
          onClick={() => router.push("/admin/verification")}
          className="cursor-pointer"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
