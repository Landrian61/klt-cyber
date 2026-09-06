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
import type { Id } from "@/lib/api";
import {
  bucketAgeBySex,
  bucketClans,
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
const ClanDistributionBar = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.ClanDistributionBar),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function DemographicsCharts({
  profiles,
  clanNameById,
}: {
  profiles: DemographicProfile[] | null | undefined;
  clanNameById: Map<Id<"clans">, string>;
}) {
  const ageBySexData = useMemo(
    () => (profiles ? bucketAgeBySex(profiles) : undefined),
    [profiles],
  );
  const maritalBySexData = useMemo(
    () => (profiles ? bucketMaritalBySex(profiles) : undefined),
    [profiles],
  );
  const clanData = useMemo(
    () => (profiles ? bucketClans(profiles, clanNameById) : undefined),
    [profiles, clanNameById],
  );

  return (
    <div className="space-y-4">
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

      <Card className="gap-5 border-t-4 border-t-primary p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Clan Distribution
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            Which clans are underrepresented?
          </p>
        </CardHeader>
        <CardContent className="h-56 p-0">
          {clanData === undefined ? (
            <Skeleton className="size-full rounded-lg" />
          ) : (
            <ClanDistributionBar data={clanData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
