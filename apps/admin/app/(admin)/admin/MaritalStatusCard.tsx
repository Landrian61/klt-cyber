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
import {
  bucketMaritalStatus,
  type DemographicProfile,
} from "./demographicsUtils";

const MaritalStatusDonut = dynamic(
  () => import("./DemographicsChartsBody").then((m) => m.MaritalStatusDonut),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function MaritalStatusCard({
  profiles,
}: {
  profiles: DemographicProfile[] | null | undefined;
}) {
  const data = useMemo(
    () => (profiles ? bucketMaritalStatus(profiles) : undefined),
    [profiles],
  );

  return (
    <Card className="gap-3 p-5">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-base font-semibold text-on-surface">
          Marital Status
        </CardTitle>
      </CardHeader>
      <CardContent className="h-48 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <MaritalStatusDonut data={data} />
        )}
      </CardContent>
    </Card>
  );
}
