"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/shadcn/skeleton";
import { monthAxisLabel, monthFullLabel } from "./libraryDashboardParts";

/**
 * The two twelve month trends, mounted lazily (spec 0017).
 *
 * Recharts is a large dependency and these two charts are the only thing on
 * the dashboard that needs it, so each body is pulled in by `next/dynamic`
 * with `ssr: false` — the convention the portal's existing charts follow. A
 * tab the operator never opens never downloads the chart code, which is the
 * same bargain as the per tab queries (AC-24).
 *
 * The two panels are also where the series are shaped: the server returns
 * `{ month: "YYYY-MM", ... }` and these wrappers turn the month key into its
 * axis label and its spelled out tooltip label. No bucketing happens here —
 * only labelling (AC-25).
 */

const AdditionsBody = dynamic(
  () =>
    import("./LibraryAdditionsChartBody").then(
      (m) => m.LibraryAdditionsChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

const MovementsBody = dynamic(
  () =>
    import("./LibraryMovementsChartBody").then(
      (m) => m.LibraryMovementsChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function LibraryAdditionsChart({
  points,
}: {
  points: { month: string; count: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <AdditionsBody
        data={points.map((point) => ({
          label: monthAxisLabel(point.month),
          full: monthFullLabel(point.month),
          count: point.count,
        }))}
      />
    </div>
  );
}

export function LibraryMovementsChart({
  points,
}: {
  points: { month: string; in: number; out: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <MovementsBody
        data={points.map((point) => ({
          label: monthAxisLabel(point.month),
          full: monthFullLabel(point.month),
          in: point.in,
          out: point.out,
        }))}
      />
    </div>
  );
}
