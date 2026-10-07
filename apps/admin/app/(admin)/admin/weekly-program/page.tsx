import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { WeeklyProgramClient } from "./WeeklyProgramClient";

export default function WeeklyProgramPage() {
  return (
    <Suspense fallback={<ListPageSkeleton columns={5} rows={5} actions={1} />}>
      <WeeklyProgramClient />
    </Suspense>
  );
}
