import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  CardSkeleton,
} from "@/components/ui/Skeletons";

// System Admin dashboard — and the fallback for any system-admin/* child
// without its own loading.tsx. Renders inside the segment layout, so the
// shell is already on screen.
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <CardSkeleton className="h-96" />
    </div>
  );
}
