"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { FollowUpsPage } from "@/components/hospitality/FollowUpsPage";

/**
 * Follow ups (spec 0024, AC-2, AC-16).
 *
 * Gated on `manageHospitality`, so it is a not found page on every other slug
 * and for any caller without it. Every function the page calls re-checks it.
 */
export default function HospitalityFollowUpsPage() {
  return (
    <DepartmentShellGate requires="manageHospitality">
      {() => <FollowUpsPage />}
    </DepartmentShellGate>
  );
}
