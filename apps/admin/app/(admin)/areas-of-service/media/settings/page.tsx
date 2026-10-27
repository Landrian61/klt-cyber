"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentSettings } from "@/components/department/DepartmentSettings";

export default function MediaSettingsPage() {
  return (
    <DepartmentShellGate>
      {(shell) => (
        <DepartmentSettings
          key={shell.department._id}
          departmentId={shell.department._id}
          departmentName={shell.department.name}
          description={shell.department.description}
          can={shell.can}
        />
      )}
    </DepartmentShellGate>
  );
}
