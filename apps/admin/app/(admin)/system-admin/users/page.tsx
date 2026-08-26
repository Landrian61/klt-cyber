import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { UsersClient } from "./UsersClient";

// The Suspense boundary is required: UsersClient reads useSearchParams, which
// opts the subtree into client-side rendering at request time.
export default function UsersPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={5} rows={25} actions={1} />}>
      <UsersClient />
    </Suspense>
  );
}
