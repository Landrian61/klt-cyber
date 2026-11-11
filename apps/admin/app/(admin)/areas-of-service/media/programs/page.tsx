"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { ProgramsPage } from "@/components/radio/ProgramsPage";

/**
 * Media's Programs page (spec 0019, AC-18). Gated on `manageRadio`, which the
 * verified Media roster holds alongside Media's leaders and a System Admin.
 * The Convex functions behind it re-check the same capability.
 */
export default function MediaProgramsPage() {
  return (
    <DepartmentShellGate requires="manageRadio">
      {() => <ProgramsPage />}
    </DepartmentShellGate>
  );
}
