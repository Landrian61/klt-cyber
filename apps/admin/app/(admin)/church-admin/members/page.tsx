import { Suspense } from "react";
import { MembersClient } from "./MembersClient";

export default function MembersPage() {
  return (
    <Suspense fallback={null}>
      <MembersClient />
    </Suspense>
  );
}
