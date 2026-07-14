import { Suspense } from "react";
import { UsersClient } from "./UsersClient";

// The Suspense boundary is required: UsersClient reads useSearchParams, which
// opts the subtree into client-side rendering at request time.
export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersClient />
    </Suspense>
  );
}
