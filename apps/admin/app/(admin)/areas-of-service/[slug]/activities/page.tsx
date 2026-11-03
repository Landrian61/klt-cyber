"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentActivities } from "@/components/department/DepartmentActivities";

export default function DepartmentActivitiesPage() {
  return (
    // `requires` so a caller without the capability gets a NOT FOUND rather
    // than a page that renders empty because the query refused it. The server
    // re-checks the same capability, so this is chrome and not the boundary.
    <DepartmentShellGate requires="createActivity">
      {(shell) => (
        <DepartmentActivities
          departmentId={shell.department._id}
          can={shell.can}
        />
      )}
    </DepartmentShellGate>
  );
}
