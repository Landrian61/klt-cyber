"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";
import {
  bucketAgeBySex,
  bucketMaritalBySex,
  type DemographicProfile,
} from "./demographicsUtils";

const AgeBySexBar = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.AgeBySexBar),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);
const MaritalBySexBar = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.MaritalBySexBar),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function DemographicsCharts({
  profiles,
  className,
}: {
  profiles: DemographicProfile[] | null | undefined;
  className?: string;
}) {
  const ageBySexData = useMemo(
    () => (profiles ? bucketAgeBySex(profiles) : undefined),
    [profiles],
  );
  const maritalBySexData = useMemo(
    () => (profiles ? bucketMaritalBySex(profiles) : undefined),
    [profiles],
  );

  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2", className)}>
      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Age Groups by Sex
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            Verified members by age group, split by sex.
          </p>
        </CardHeader>
        <CardContent className="h-56 p-0">
          {ageBySexData === undefined ? (
            <Skeleton className="size-full rounded-lg" />
          ) : (
            <AgeBySexBar data={ageBySexData} />
          )}
        </CardContent>
      </Card>

      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Marital Status by Sex
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            Supports sizing singles, men&apos;s, and women&apos;s ministries.
          </p>
        </CardHeader>
        <CardContent className="h-56 p-0">
          {maritalBySexData === undefined ? (
            <Skeleton className="size-full rounded-lg" />
          ) : (
            <MaritalBySexBar data={maritalBySexData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
