"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Skeleton } from "@/components/shadcn/skeleton";

const CategoryDonut = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.CategoryDonut),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function DepartmentRosterChart({
  data,
}: {
  data: { name: string; count: number }[] | null | undefined;
}) {
  const donutData = useMemo(
    () => (data ? data.map((d) => ({ label: d.name, count: d.count })) : data),
    [data],
  );

  return (
    <Card className="gap-5 p-6">
      <CardHeader className="flex-row items-start justify-between gap-3 p-0">
        <div className="space-y-1">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Department Roster Sizes
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            Share of the roster by department — where is a department thin?
          </p>
        </div>
        <Badge variant="neutral" className="shrink-0">
          Self-reported
        </Badge>
      </CardHeader>
      <CardContent className="h-72 p-0">
        {donutData === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : donutData === null ? (
          <p className="font-body text-sm text-on-surface-variant">
            Not available.
          </p>
        ) : (
          <CategoryDonut data={donutData} />
        )}
      </CardContent>
      <p className="font-body text-xs text-outline">
        Members pick their department(s) during signup — this isn&apos;t yet
        an HOD-confirmed roster. Treat a thin slice as "underclaimed," not
        necessarily "understaffed."
      </p>
    </Card>
  );
}
