import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { AnnouncementsClient } from "./AnnouncementsClient";

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={5} rows={5} actions={1} />}>
      <AnnouncementsClient />
    </Suspense>
  );
}
