"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
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

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "none",
    backgroundColor: "var(--color-surface-lowest)",
    boxShadow: "0 16px 40px -12px rgba(28, 28, 24, 0.22)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--color-on-surface)" },
  itemStyle: { color: "var(--color-on-surface-variant)" },
};

const DONUT_COLORS = [
  "var(--color-primary)",
  "var(--color-royal)",
  "var(--color-on-surface-variant)",
];

export function MaritalStatusDonut({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--color-on-surface-variant)",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function AgeGroupsBar({
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
          {...tooltipStyle}
        />
               <Bar dataKey="count" fill="var(--color-royal)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ClanDistributionBar({
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
          width={28}
        />
        <Tooltip
          cursor={{ fill: "var(--color-surface-low)" }}
          {...tooltipStyle}
        />
        <Bar
          dataKey="count"
          fill="var(--color-primary)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AgeBySexBar({
  data,
}: {
  data: { label: string; male: number; female: number }[];
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
          {...tooltipStyle}
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
        <Bar
          dataKey="male"
          name="Male"
          fill="var(--color-royal)"
          radius={[6, 6, 0, 0]}
        />
        <Bar
          dataKey="female"
          name="Female"
          fill="var(--color-crimson)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MaritalBySexBar({
  data,
}: {
  data: { label: string; male: number; female: number }[];
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
          {...tooltipStyle}
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
        <Bar
          dataKey="male"
          name="Male"
          fill="var(--color-royal)"
          radius={[6, 6, 0, 0]}
        />
        <Bar
          dataKey="female"
          name="Female"
          fill="var(--color-crimson)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
