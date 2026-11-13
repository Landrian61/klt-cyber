"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { ClanPlacementPage } from "@/components/hospitality/ClanPlacementPage";

/**
 * Clan placement (spec 0024, AC-2, AC-32 to AC-34).
 *
 * Gated on `manageHospitality` like every Hospitality page, so it is a not
 * found page on every other slug and for any caller without it. The queries
 * and `assignClan` re-check the same capability.
 */
export default function HospitalityClanPlacementPage() {
  return (
    <DepartmentShellGate requires="manageHospitality">
      {() => <ClanPlacementPage />}
    </DepartmentShellGate>
  );
}
