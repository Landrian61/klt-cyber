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

// Closed-palette categorical series — enough distinct, token-only colors for
// any "few categories" dimension we have (max 5, Leadership stage). Bar mode
// only ever runs when both axes have <=6 values (see CrossTabExplorer's
// mode heuristic), so this never needs to stretch further.
const SERIES_COLORS = [
  "var(--color-primary)",
  "var(--color-royal)",
  "var(--color-crimson)",
  "var(--color-on-surface-variant)",
  "var(--color-primary-container)",
  "var(--color-crimson-light)",
];

export function CrossTabBarBody({
  rows,
  cols,
  matrix,
}: {
  rows: string[];
  cols: string[];
  matrix: number[][];
}) {
  const data = rows.map((row, i) => {
    const entry: Record<string, string | number> = { row };
    cols.forEach((col, j) => {
      entry[col] = matrix[i][j];
    });
    return entry;
  });

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
          dataKey="row"
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
        {cols.map((col, j) => (
          <Bar
            key={col}
            dataKey={col}
            stackId="cross-tab"
            name={col}
            fill={SERIES_COLORS[j % SERIES_COLORS.length]}
            radius={j === cols.length - 1 ? [0, 6, 6, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
