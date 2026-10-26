"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Cell,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The analytics page's chart bodies (spec 0011).
 *
 * Separated from the page because Recharts measures the DOM, so every chart
 * here is loaded through `dynamic(..., { ssr: false })` the way the
 * Administration dashboard's charts already are. Keeping them in one module
 * means one chunk for the four of them rather than four.
 *
 * Every colour is a design token read through `var(--color-…)`, which works
 * in SVG exactly as it does in CSS. No chart here draws a horizontal grid: the
 * No-Line Rule applies to a chart as much as to a card, and the axis ticks
 * already tell you the scale.
 *
 * None of these invents data. A chart is only drawn where the query returns a
 * real series, and a series with quiet days keeps them as zeroes rather than
 * closing the gap.
 */

const axisTick = {
  fontSize: 11,
  fontFamily: "var(--font-body)",
  fill: "var(--color-on-surface-variant)",
};

const monoTick = { ...axisTick, fontFamily: "var(--font-mono)" };

const tooltipStyle = {
  borderRadius: 12,
  border: "none",
  backgroundColor: "var(--color-surface-lowest)",
  boxShadow: "0 16px 40px -12px rgba(28, 28, 24, 0.22)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
};

const tooltipProps = {
  contentStyle: tooltipStyle,
  labelStyle: { color: "var(--color-on-surface)", fontWeight: 600 },
  itemStyle: { color: "var(--color-on-surface-variant)" },
} as const;

/** "2026-10-26" as "26 Oct", which is all an axis has room for. */
function shortDay(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${months[month - 1]}`;
}

// ── Growth ────────────────────────────────────────────────────────────────

/**
 * Sign-ups a day as bars, with the running account total as a line.
 *
 * Two series because they answer different questions and the interesting
 * reading is the pair: a flat line with occasional bars is a platform growing
 * in bursts, usually after something happened at church, and seeing which day
 * the burst landed on is the point of keeping the empty days in.
 */
export function GrowthChartBody({
  data,
}: {
  data: { dateKey: string; signups: number; total: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="dateKey"
          tickFormatter={shortDay}
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          minTickGap={28}
        />
        <YAxis
          yAxisId="signups"
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={monoTick}
          width={28}
        />
        <YAxis
          yAxisId="total"
          orientation="right"
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={monoTick}
          width={36}
        />
        <Tooltip
          {...tooltipProps}
          cursor={{ fill: "var(--color-surface-high)", opacity: 0.5 }}
          labelFormatter={(value) => shortDay(String(value))}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontFamily: "var(--font-body)", fontSize: 12 }}
        />
        <Bar
          yAxisId="signups"
          dataKey="signups"
          name="Sign-ups"
          fill="var(--color-primary)"
          radius={[3, 3, 0, 0]}
          maxBarSize={14}
        />
        <Line
          yAxisId="total"
          type="monotone"
          dataKey="total"
          name="Total accounts"
          stroke="var(--color-royal)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Recency ───────────────────────────────────────────────────────────────

// Gold fading to grey as the gap widens, so the bar for accounts nobody has
// seen in a month reads as the quiet one without being coloured as an error.
// It is a fact about the church, not a fault, so it never takes crimson.
const RECENCY_BARS = [
  { fill: "var(--color-primary)", opacity: 1 },
  { fill: "var(--color-primary)", opacity: 0.55 },
  { fill: "var(--color-royal)", opacity: 0.7 },
  { fill: "var(--color-outline)", opacity: 0.55 },
];

/**
 * Where every account sits by how recently it was last seen.
 *
 * The three activity windows nest, so subtracting them gives four groups that
 * partition the whole church exactly once: seen today, seen this week, seen
 * this month, and not seen at all. That last bar is the one worth looking at,
 * and it is invisible in three nested counts — which is the reason this chart
 * exists rather than another tile.
 */
export function RecencyChartBody({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          width={104}
        />
        <Tooltip
          {...tooltipProps}
          cursor={{ fill: "var(--color-surface-high)", opacity: 0.5 }}
        />
        <Bar dataKey="count" name="Accounts" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((row, index) => (
            <Cell
              key={row.label}
              fill={RECENCY_BARS[index].fill}
              fillOpacity={RECENCY_BARS[index].opacity}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Allowance burn ────────────────────────────────────────────────────────

/**
 * Emails sent so far this month, running total, against the plan's allowance.
 *
 * The dashed line continues today's average to the end of the month. It is a
 * projection and is labelled as one: it answers "if the rest of the month
 * looks like this one, do we run out?", which is a decision, where "412 sent"
 * on its own is only a fact.
 *
 * The allowance line is only passed in when the cost register holds one, so
 * this chart never draws a ceiling nobody recorded.
 */
export function AllowanceChartBody({
  data,
  allowance,
}: {
  // `cumulative` is null for days that have not happened yet, which is how
  // the solid line stops at today instead of diving to zero.
  data: {
    dateKey: string;
    cumulative: number | null;
    projected: number | null;
  }[];
  allowance: number | null;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="allowanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-royal)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-royal)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="dateKey"
          tickFormatter={shortDay}
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          minTickGap={28}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={monoTick}
          width={36}
        />
        <Tooltip
          {...tooltipProps}
          labelFormatter={(value) => shortDay(String(value))}
        />
        {allowance !== null && (
          <ReferenceLine
            y={allowance}
            stroke="var(--color-crimson)"
            strokeDasharray="4 4"
            label={{
              value: `Allowance ${allowance.toLocaleString("en-US")}`,
              position: "insideTopRight",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fill: "var(--color-crimson)",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="cumulative"
          name="Sent so far"
          stroke="var(--color-royal)"
          strokeWidth={2}
          fill="url(#allowanceFill)"
          dot={false}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="projected"
          name="If the rest of the month matches"
          stroke="var(--color-outline)"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Department engagement ─────────────────────────────────────────────────

/**
 * Messages and activities per department, ranked by total.
 *
 * Ranked rather than alphabetical, and that is the whole design: a department
 * that did nothing this month sits at the bottom with no bar, which is exactly
 * the row somebody is scanning for. Alphabetical order hides it in the middle.
 */
export function DepartmentChartBody({
  data,
}: {
  data: { name: string; messages: number; activities: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
        barCategoryGap="22%"
      >
        <CartesianGrid
          horizontal={false}
          stroke="var(--color-border)"
          strokeOpacity={0.7}
        />
        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={monoTick} />
        <YAxis
          type="category"
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          width={132}
        />
        <Tooltip
          {...tooltipProps}
          cursor={{ fill: "var(--color-surface-high)", opacity: 0.5 }}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontFamily: "var(--font-body)", fontSize: 12 }}
        />
        <Bar
          dataKey="messages"
          name="Messages"
          stackId="engagement"
          fill="var(--color-primary)"
          maxBarSize={20}
        />
        <Bar
          dataKey="activities"
          name="Activities"
          stackId="engagement"
          fill="var(--color-royal)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
