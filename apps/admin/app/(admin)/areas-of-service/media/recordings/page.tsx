"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { RecordingsPage } from "@/components/radio/RecordingsPage";

/**
 * Media's Recordings page (spec 0019, AC-24 to AC-26). Gated on
 * `manageRadio`; every Convex function behind it re-checks the same
 * capability.
 */
export default function MediaRecordingsPage() {
  return (
    <DepartmentShellGate requires="manageRadio">
      {() => <RecordingsPage />}
    </DepartmentShellGate>
  );
}
