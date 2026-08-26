import { PageHeaderSkeleton, CardSkeleton } from "@/components/ui/Skeletons";
import { Skeleton } from "@/components/shadcn/skeleton";

// Content module: tabbed manager over stacked content cards.
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-9 w-72 rounded-md" />
      <CardSkeleton className="h-80" />
    </div>
  );
}
