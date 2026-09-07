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
import { bucketMentorship, mentorshipCompletionRate } from "./demographicsUtils";

type MentorshipProfile = {
  mentorshipStatus: "not_enrolled" | "enrolled" | "completed";
};

const MentorshipPipelineChartBody = dynamic(
  () =>
    import("./MentorshipPipelineChartBody").then(
      (m) => m.MentorshipPipelineChartBody,
    ),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function MentorshipPipelineChart({
  profiles,
}: {
  profiles: MentorshipProfile[] | null | undefined;
}) {
  const data = useMemo(
    () => (profiles ? bucketMentorship(profiles) : undefined),
    [profiles],
  );
  const rate = useMemo(
    () => (profiles ? mentorshipCompletionRate(profiles) : undefined),
    [profiles],
  );

  return (
    <Card className="gap-5 p-6">
      <CardHeader className="flex-row items-start justify-between gap-3 p-0">
        <div className="space-y-1">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Mentorship Pipeline
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            How many are progressing toward full membership, and where
            they&apos;re stalling.
          </p>
        </div>
        {rate !== undefined && rate !== null && (
          <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold text-crimson">
            {rate}% completed
          </span>
        )}
      </CardHeader>
      <CardContent className="h-52 p-0">
        {data === undefined ? (
          <Skeleton className="size-full rounded-lg" />
        ) : (
          <MentorshipPipelineChartBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}
