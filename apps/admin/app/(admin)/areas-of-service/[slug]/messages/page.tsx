"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentMessages } from "@/components/department/DepartmentMessages";

export default function DepartmentMessagesPage() {
  return (
    <DepartmentShellGate>
      {(shell) => (
        <DepartmentMessages
          departmentId={shell.department._id}
          departmentName={shell.department.name}
          can={shell.can}
        />
      )}
    </DepartmentShellGate>
  );
}
