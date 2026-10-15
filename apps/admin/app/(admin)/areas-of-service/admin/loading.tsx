import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  CardSkeleton,
} from "@/components/ui/Skeletons";

// Administration dashboard — and the fallback for any admin/* child that has
// no loading.tsx of its own. It sits inside the segment layout, so the sidebar
// and top bar stay put while only the content column swaps.
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton className="h-72" />
        <CardSkeleton className="h-72" />
      </div>
    </div>
  );
}
