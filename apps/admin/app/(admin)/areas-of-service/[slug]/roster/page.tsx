"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentRoster } from "@/components/department/DepartmentRoster";

export default function DepartmentRosterPage() {
  return (
    <DepartmentShellGate>
      {(shell) => (
        <DepartmentRoster
          departmentId={shell.department._id}
          can={shell.can}
        />
      )}
    </DepartmentShellGate>
  );
}
