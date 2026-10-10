import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { PastEventsClient } from "./PastEventsClient";

export default function PastEventsPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={3} rows={3} actions={1} />}>
      <PastEventsClient />
    </Suspense>
  );
}
