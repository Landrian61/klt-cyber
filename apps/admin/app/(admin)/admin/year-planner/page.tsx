import { Suspense } from "react";
import { YearPlannerClient } from "./YearPlannerClient";

export default function YearPlannerPage() {
  return (
    <Suspense fallback={null}>
      <YearPlannerClient />
    </Suspense>
  );
}
