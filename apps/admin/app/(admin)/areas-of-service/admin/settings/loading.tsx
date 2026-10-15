import { PageHeaderSkeleton, CardSkeleton } from "@/components/ui/Skeletons";

// Settings: stacked form cards.
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <CardSkeleton className="h-64" />
      <CardSkeleton className="h-48" />
    </div>
  );
}
