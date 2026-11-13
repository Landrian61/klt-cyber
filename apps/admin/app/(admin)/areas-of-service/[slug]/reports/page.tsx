"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { ReportsPage } from "@/components/hospitality/ReportsPage";

/**
 * Reports (spec 0024, AC-2, AC-36).
 *
 * Gated on `manageHospitality` like every Hospitality page, so it is a not
 * found page on every other slug and for any caller without it. `getReport`
 * re-checks the same capability.
 */
export default function HospitalityReportsPage() {
  return (
    <DepartmentShellGate requires="manageHospitality">
      {() => <ReportsPage />}
    </DepartmentShellGate>
  );
}
