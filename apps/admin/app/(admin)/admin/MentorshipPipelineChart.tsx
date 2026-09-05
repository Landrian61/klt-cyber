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

type MentorshipProfile = {
  mentorshipStatus: "not_enrolled" | "enrolled" | "completed";
};

function bucketMentorship(profiles: MentorshipProfile[]) {
  const counts = { not_enrolled: 0, enrolled: 0, completed: 0 };
  for (const p of profiles) counts[p.mentorshipStatus] += 1;
  return [
    { label: "Not enrolled", count: counts.not_enrolled },
    { label: "Enrolled", count: counts.enrolled },
    { label: "Completed", count: counts.completed },
  ];
}

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

  return (
    <Card className="gap-5 p-6">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-lg font-semibold text-on-surface">
          Mentorship Pipeline
        </CardTitle>
        <p className="font-body text-sm text-on-surface-variant">
          How many are progressing toward full membership?
        </p>
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
