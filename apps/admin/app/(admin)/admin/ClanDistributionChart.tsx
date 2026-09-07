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
import { bucketClans, type DemographicProfile } from "./demographicsUtils";

const CategoryDonut = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.CategoryDonut),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function ClanDistributionChart({
  profiles,
  clanNameById,
}: {
  profiles: DemographicProfile[] | null | undefined;
  clanNameById: Map<Id<"clans">, string>;
}) {
  const data = useMemo(
    () => (profiles ? bucketClans(profiles, clanNameById) : undefined),
    [profiles, clanNameById],
  );

  return (
    <Card className="gap-5 border-t-4 border-t-primary p-6">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Clan Distribution
        </CardTitle>
        <p className="font-body text-sm text-on-surface-variant">
          Which clans are underrepresented?
        </p>
      </CardHeader>
      <CardContent className="h-72 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <CategoryDonut data={data} />
        )}
      </CardContent>
    </Card>
  );
}
