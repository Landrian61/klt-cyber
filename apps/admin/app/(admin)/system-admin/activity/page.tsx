import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { ActivityClient } from "./ActivityClient";

// The Suspense boundary is required: ActivityClient reads useSearchParams,
// which opts the subtree into client-side rendering at request time.
export default function ActivityPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={4} rows={25} actions={0} />}>
      <ActivityClient />
    </Suspense>
  );
}
