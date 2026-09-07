"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";

type VerifiedProfile = { verifiedAt?: number };

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const CURRENT_MONTH = NOW.getMonth(); // 0-11

// Compact trigger — matches the treatment established for every other
// filter control on this dashboard (Zone 1 filter bar, Custom Cross-Tab):
// h-8/text-xs rather than Select's touch-sized h-11/text-base default.
const COMPACT_TRIGGER =
  "h-8 w-[4.5rem] px-2 py-1 text-xs [&>span]:min-w-0 [&>span]:truncate";

/** Years with at least one verified member, plus the current year even if
 * empty — so the picker is never stuck offering only a year with no data,
 * and never missing the year someone would actually reach for. */
function availableYears(profiles: VerifiedProfile[]): number[] {
  const verifiedYears = profiles
    .map((p) => p.verifiedAt)
    .filter((v): v is number => typeof v === "number")
    .map((v) => new Date(v).getFullYear());
  const minYear = verifiedYears.length > 0 ? Math.min(...verifiedYears) : CURRENT_YEAR;
  const years: number[] = [];
  for (let y = CURRENT_YEAR; y >= minYear; y--) years.push(y);
  return years;
}

/** Cumulative verified-member count as of the end of each month in
 * [fromMonth, toMonth] of `year` — "cumulative" meaning total-to-date, not
 * verifications within the window, so this reads as headcount growth over
 * time, not an activity count. */
function bucketByMonthRange(
  profiles: VerifiedProfile[],
  year: number,
  fromMonth: number,
  toMonth: number,
) {
  const months: { label: string; monthStart: Date; count: number }[] = [];
  for (let m = fromMonth; m <= toMonth; m++) {
    months.push({ label: MONTH_LABELS[m], monthStart: new Date(year, m, 1), count: 0 });
  }
  const verifiedDates = profiles
    .map((p) => p.verifiedAt)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);

  for (const month of months) {
    const cutoff = new Date(
      month.monthStart.getFullYear(),
      month.monthStart.getMonth() + 1,
      1,
    ).getTime();
    month.count = verifiedDates.filter((v) => v < cutoff).length;
  }
  return months.map(({ label, count }) => ({ label, count }));
}

const MembershipGrowthChartBody = dynamic(
  () =>
    import("./MembershipGrowthChartBody").then(
      (m) => m.MembershipGrowthChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function MembershipGrowthChart({
  profiles,
}: {
  profiles: VerifiedProfile[] | null | undefined;
}) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [fromMonth, setFromMonth] = useState(0);
  const [toMonth, setToMonth] = useState(CURRENT_MONTH);

  const years = useMemo(
    () => (profiles ? availableYears(profiles) : [CURRENT_YEAR]),
    [profiles],
  );

  function handleYearChange(value: string) {
    const newYear = Number(value);
    setYear(newYear);
    // A fresh year defaults to Jan through "now" for the current year, or
    // the full Jan–Dec for any past year — narrow from there via the two
    // month pickers if a shorter window is wanted.
    setFromMonth(0);
    setToMonth(newYear === CURRENT_YEAR ? CURRENT_MONTH : 11);
  }

  function handleFromMonthChange(value: string) {
    const newFrom = Number(value);
    setFromMonth(newFrom);
    if (newFrom > toMonth) setToMonth(newFrom);
  }

  function handleToMonthChange(value: string) {
    const newTo = Number(value);
    setToMonth(newTo);
    if (newTo < fromMonth) setFromMonth(newTo);
  }

  const data = useMemo(
    () =>
      profiles ? bucketByMonthRange(profiles, year, fromMonth, toMonth) : undefined,
    [profiles, year, fromMonth, toMonth],
  );

  const monthOptions = year === CURRENT_YEAR
    ? MONTH_LABELS.slice(0, CURRENT_MONTH + 1)
    : MONTH_LABELS;

  return (
    <Card className="gap-5 border-t-4 border-t-primary p-6">
      <CardHeader className="flex-col items-start gap-3 p-0 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Membership Growth
          </CardTitle>
          <CardDescription className="text-sm">
            Cumulative verified members over time.
          </CardDescription>
        </div>

        <div className="flex items-end gap-1.5">
          <Select value={String(year)} onValueChange={handleYearChange}>
            <SelectTrigger className={COMPACT_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="pb-1.5 font-body text-xs text-on-surface-variant">
            from
          </span>
          <Select value={String(fromMonth)} onValueChange={handleFromMonthChange}>
            <SelectTrigger className={COMPACT_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((label, i) => (
                <SelectItem key={label} value={String(i)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="pb-1.5 font-body text-xs text-on-surface-variant">
            to
          </span>
          <Select value={String(toMonth)} onValueChange={handleToMonthChange}>
            <SelectTrigger className={COMPACT_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((label, i) => (
                <SelectItem key={label} value={String(i)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="h-56 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <MembershipGrowthChartBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}
