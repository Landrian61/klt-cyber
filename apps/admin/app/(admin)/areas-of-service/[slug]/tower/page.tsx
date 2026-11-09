"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { TowerPage } from "@/components/realEstate/TowerPage";

/**
 * The Tower of Faith: floors, and the facilities on them (spec 0018, AC-3).
 *
 * Thin on purpose, like every shell route (spec 0012, AC-2): the page knows
 * which component to mount and nothing else.
 *
 * The gate is the capability, not the slug. `manageRealEstate` is granted only
 * inside the Real Estate department, so a caller from anywhere else gets a not
 * found rather than an empty page, and the Convex functions behind this
 * re-check the same rule — the gate here is user experience, not the boundary.
 */
export default function RealEstateTowerPage() {
  return (
    <DepartmentShellGate requires="manageRealEstate">
      {() => <TowerPage />}
    </DepartmentShellGate>
  );
}
