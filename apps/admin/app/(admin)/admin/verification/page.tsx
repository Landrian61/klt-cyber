import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { VerificationClient } from "./VerificationClient";

export default function VerificationPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={5} rows={5} actions={0} />}>
      <VerificationClient />
    </Suspense>
  );
}
