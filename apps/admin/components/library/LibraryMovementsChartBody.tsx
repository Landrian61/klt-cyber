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
 * Quantities in against quantities out, per Kampala month (spec 0017, AC-15).
 *
 * Two series on ONE axis, which they can share because both are the same
 * unit: a count of units moved. Grouped rather than stacked, because the
 * question is "did more come in than went out this month", and a stacked bar
 * answers "how much moved in total" instead.
 *
 * Gold and Royal Blue, the two brand hues the colour checks pass cleanly on
 * (separation well above the floor in normal vision and in every simulated
 * colour deficiency). The legend is always present for two series, and each
 * bar's own value is in the tooltip, so identity is never carried by colour
 * alone.
 */

const axisTick = {
  fontSize: 12,
  fontFamily: "var(--font-body)",
  fill: "var(--color-on-surface-variant)",
};

export function LibraryMovementsChartBody({
  data,
}: {
  data: { label: string; full: string; in: number; out: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        // A 2px gap of card surface between the two bars of a pair, so the
        // fills never touch and read as one block.
        barGap={2}
        barCategoryGap="22%"
      >
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
          cursor={{ fill: "var(--color-surface-low)" }}
          labelFormatter={(_label, payload) =>
            payload?.[0]?.payload?.full ?? ""
          }
          formatter={(value, name) => {
            const units = typeof value === "number" ? value : 0;
            return [units === 1 ? "1 unit" : `${units} units`, name];
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
            // Text wears a text token, never the series colour; the swatch
            // beside it carries the identity.
            color: "var(--color-on-surface-variant)",
          }}
        />
        <Bar
          dataKey="in"
          name="In"
          fill="var(--color-royal)"
          radius={[4, 4, 0, 0]}
          maxBarSize={14}
        />
        <Bar
          dataKey="out"
          name="Out"
          fill="var(--color-primary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
