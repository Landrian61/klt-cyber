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
import type { Id } from "@/lib/api";
import { bucketClanByMaritalStatus } from "./demographicsUtils";

type ClanMaritalProfile = {
  clanId?: Id<"clans">;
  maritalStatus: "single" | "married" | "widowed" | "divorced";
};

const ClanMaritalChartBody = dynamic(
  () =>
    import("./ClanMaritalChartBody").then((m) => m.ClanMaritalChartBody),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function ClanMaritalChart({
  profiles,
  clanNameById,
  className,
}: {
  profiles: ClanMaritalProfile[] | null | undefined;
  clanNameById: Map<Id<"clans">, string>;
  className?: string;
}) {
  const data = useMemo(
    () =>
      profiles ? bucketClanByMaritalStatus(profiles, clanNameById) : undefined,
    [profiles, clanNameById],
  );

  return (
    <Card className={cn("gap-5 p-6", className)}>
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Clan × Marital Status
        </CardTitle>
        <p className="font-body text-sm text-on-surface-variant">
          Sizing for singles, men&apos;s and women&apos;s ministries, by clan.
        </p>
      </CardHeader>
      <CardContent className="h-72 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <ClanMaritalChartBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}
