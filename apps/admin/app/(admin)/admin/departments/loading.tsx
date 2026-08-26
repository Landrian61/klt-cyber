import { PageHeaderSkeleton } from "@/components/ui/Skeletons";
import { Skeleton } from "@/components/shadcn/skeleton";

// Areas of Service index: a card grid, not a table.
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-surface-lowest p-6 shadow-e1"
          >
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-4 w-full bg-surface-low" />
            <Skeleton className="mt-2 h-4 w-2/3 bg-surface-low" />
          </div>
        ))}
      </div>
    </div>
  );
}
