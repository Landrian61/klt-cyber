"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { SpacesPage } from "@/components/realEstate/SpacesPage";

/**
 * Spaces to let (spec 0018, AC-3).
 *
 * Same shape and same gate as the Tower page beside it: `manageRealEstate`,
 * which only the Real Estate department grants, re-checked server side by
 * every function this page calls.
 */
export default function RealEstateSpacesPage() {
  return (
    <DepartmentShellGate requires="manageRealEstate">
      {() => <SpacesPage />}
    </DepartmentShellGate>
  );
}
