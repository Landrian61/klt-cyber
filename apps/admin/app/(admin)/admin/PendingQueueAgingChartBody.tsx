"use client";

import {
  Bar,
  BarChart,
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

export function PendingQueueAgingChartBody({
  data,
}: {
  data: { label: string; count: number }[];
}) {
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
        />
        <Bar
          dataKey="count"
          radius={[6, 6, 0, 0]}
          fill="var(--color-primary)"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
