"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentRoster } from "@/components/department/DepartmentRoster";

/**
 * Media's roster is the shared one (spec 0012, AC-3). The page exists only to
 * mount it inside Media's own portal chrome; there is no Media-specific copy.
 */
export default function MediaRosterPage() {
  return (
    <DepartmentShellGate>
      {(shell) => (
        <DepartmentRoster departmentId={shell.department._id} can={shell.can} />
      )}
    </DepartmentShellGate>
  );
}
