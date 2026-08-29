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
  bucketAgeGroups,
  bucketClans,
  type DemographicProfile,
} from "./demographicsUtils";

const AgeGroupsBar = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.AgeGroupsBar),
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
  const ageData = useMemo(
    () => (profiles ? bucketAgeGroups(profiles) : undefined),
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
            Age Groups
          </CardTitle>
        </CardHeader>
        <CardContent className="h-52 p-0">
          {ageData === undefined ? (
            <Skeleton className="size-full rounded-lg" />
          ) : (
            <AgeGroupsBar data={ageData} />
          )}
        </CardContent>
      </Card>

      <Card className="gap-5 border-t-4 border-t-primary p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Clan Distribution
          </CardTitle>
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
