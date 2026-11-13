"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { VisitorsPage } from "@/components/hospitality/VisitorsPage";

/**
 * Visitors (spec 0024, AC-2).
 *
 * Gated on `manageHospitality`, which only the Hospitality department grants,
 * so this route is a not found page on every other slug and for any caller
 * without it. Every function the page calls re-checks the same capability.
 */
export default function HospitalityVisitorsPage() {
  return (
    <DepartmentShellGate requires="manageHospitality">
      {() => <VisitorsPage />}
    </DepartmentShellGate>
  );
}
