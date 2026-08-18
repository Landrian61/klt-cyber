import { Suspense } from "react";
import { WeeklyProgramClient } from "./WeeklyProgramClient";

export default function WeeklyProgramPage() {
  return (
    <Suspense fallback={null}>
      <WeeklyProgramClient />
    </Suspense>
  );
}
