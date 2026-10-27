"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentActivities } from "@/components/department/DepartmentActivities";

export default function MediaActivitiesPage() {
  return (
    <DepartmentShellGate>
      {(shell) => (
        <DepartmentActivities
          departmentId={shell.department._id}
          can={shell.can}
        />
      )}
    </DepartmentShellGate>
  );
}
