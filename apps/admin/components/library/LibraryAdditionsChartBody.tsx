"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Items added per Kampala month, twelve points (spec 0017, AC-10).
 *
 * One series, so no legend: the panel title names it. An area rather than bars
 * because the question is the shape of the growth over a year, not a
 * comparison between two particular months.
 *
 * Recharts lives in this file and only this file, mounted lazily by
 * `LibraryAdditionsChart`, which is the convention the portal's other charts
 * already follow.
 */

const axisTick = {
  fontSize: 12,
  fontFamily: "var(--font-body)",
  fill: "var(--color-on-surface-variant)",
};

export function LibraryAdditionsChartBody({
  data,
}: {
  data: { label: string; full: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="libraryAdditionsFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-primary)"
              stopOpacity={0.22}
            />
            <stop
              offset="100%"
              stopColor="var(--color-primary)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        {/* Recessive: horizontal only, so the grid reads the values without
            drawing a box around the data. */}
        <CartesianGrid
          horizontal
          vertical={false}
          stroke="var(--color-border)"
        />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ ...axisTick, fontFamily: "var(--font-mono)" }}
          width={32}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-border)" }}
          // The axis is abbreviated to keep twelve labels legible, so the
          // tooltip is where the month is spelled out in full.
          labelFormatter={(_label, payload) =>
            payload?.[0]?.payload?.full ?? ""
          }
          // Recharts hands the formatter a possibly undefined value, so the
          // count is narrowed here rather than asserted.
          formatter={(value) => {
            const count = typeof value === "number" ? value : 0;
            return [count === 1 ? "1 item" : `${count} items`, "Added"];
          }}
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
        <Area
          type="monotone"
          dataKey="count"
          name="Added"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#libraryAdditionsFill)"
          // At least 8px across, per the mark specs, and ringed in the card
          // surface so two near points stay separable.
          dot={{
            r: 4,
            fill: "var(--color-primary)",
            stroke: "var(--color-surface-lowest)",
            strokeWidth: 2,
          }}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
