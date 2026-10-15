import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/ui/Skeletons";
import { Skeleton } from "@/components/shadcn/skeleton";
import { YearPlannerClient } from "./YearPlannerClient";

// Matches loading.tsx in this segment: view switcher above the 12 mini-months,
// so the planner grid lands in the box the skeleton was holding.
function YearPlannerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-9 w-64 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function YearPlannerPage() {
  return (
    <Suspense fallback={<YearPlannerSkeleton />}>
      <YearPlannerClient />
    </Suspense>
  );
}
