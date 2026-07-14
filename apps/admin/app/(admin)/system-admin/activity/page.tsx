import { Suspense } from "react";
import { ActivityClient } from "./ActivityClient";

// The Suspense boundary is required: ActivityClient reads useSearchParams,
// which opts the subtree into client-side rendering at request time.
export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityClient />
    </Suspense>
  );
}
