import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { DevotionalsClient } from "./DevotionalsClient";

export default function DevotionalsPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={4} rows={5} actions={1} />}>
      <DevotionalsClient />
    </Suspense>
  );
}
