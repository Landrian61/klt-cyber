"use client";

import { Suspense } from "react";
import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { ReportPrintPage } from "@/components/hospitality/ReportPrintPage";

/**
 * The report's print view (spec 0024, AC-2, AC-37), gated exactly like
 * Reports. Suspense because the range comes from the search params.
 */
export default function HospitalityReportPrintPage() {
  return (
    <DepartmentShellGate requires="manageHospitality">
      {() => (
        <Suspense fallback={null}>
          <ReportPrintPage />
        </Suspense>
      )}
    </DepartmentShellGate>
  );
}
