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

/**
 * Visitors per bin, first timers stacked on returning visitors (AC-36).
 *
 * Stacked because every visitor in a bin is exactly one of the two, so the
 * bar's height is the bin's distinct visitors and the split shows how much of
 * it was new. Gold and Royal Blue, the brand pair the Library charts already
 * use; the legend is always shown, so identity never rests on colour alone.
 */

const axisTick = {
  fontSize: 12,
  fontFamily: "var(--font-body)",
  fill: "var(--color-on-surface-variant)",
};

export function ReportChartBody({
  data,
  animate = true,
}: {
  data: { label: string; full: string; firstTimers: number; returning: number }[];
  /** Off for the print page, so the chart is fully drawn when printing. */
  animate?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid horizontal vertical={false} stroke="var(--color-border)" />
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
          cursor={{ fill: "var(--color-surface-low)" }}
          labelFormatter={(_label, payload) => payload?.[0]?.payload?.full ?? ""}
          formatter={(value, name) => {
            const count = typeof value === "number" ? value : 0;
            return [count === 1 ? "1 visitor" : `${count} visitors`, name];
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
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--color-on-surface-variant)",
          }}
        />
        <Bar
          dataKey="returning"
          name="Returning"
          stackId="visitors"
          fill="var(--color-royal)"
          maxBarSize={28}
          isAnimationActive={animate}
        />
        <Bar
          dataKey="firstTimers"
          name="First timers"
          stackId="visitors"
          fill="var(--color-primary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={animate}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
