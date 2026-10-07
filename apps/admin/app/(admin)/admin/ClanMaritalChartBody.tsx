"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

// Horizontal, stacked: clan names read as labels, not tick marks — vertical
// bars would force rotated/truncated text at this category count, stacked
// by marital status.
export function ClanMaritalChartBody({
  data,
}: {
  data: { clan: string; single: number; married: number; other: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid
          horizontal={false}
          stroke="var(--color-border)"
          strokeDasharray="3 3"
        />
        <XAxis
          type="number"
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ ...axisTick, fontFamily: "var(--font-mono)" }}
        />
        <YAxis
          type="category"
          dataKey="clan"
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          width={130}
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
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--color-on-surface-variant)",
          }}
        />
        <Bar dataKey="single" stackId="marital" name="Single" fill="var(--color-primary)" />
        <Bar dataKey="married" stackId="marital" name="Married" fill="var(--color-royal)" />
        <Bar
          dataKey="other"
          stackId="marital"
          name="Other"
          fill="var(--color-on-surface-variant)"
          radius={[0, 6, 6, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
