import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { MembersClient } from "./MembersClient";

export default function MembersPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={7} rows={10} actions={1} />}>
      <MembersClient />
    </Suspense>
  );
}
