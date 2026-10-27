"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentActivities } from "@/components/department/DepartmentActivities";

export default function DepartmentActivitiesPage() {
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
