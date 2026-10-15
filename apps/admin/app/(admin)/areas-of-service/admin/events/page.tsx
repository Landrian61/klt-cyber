import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { EventsClient } from "./EventsClient";

export default function EventsPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={5} rows={5} actions={1} />}>
      <EventsClient />
    </Suspense>
  );
}
