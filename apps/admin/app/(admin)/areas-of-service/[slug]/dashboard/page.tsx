"use client";

import { use } from "react";
import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentDashboard } from "@/components/department/DepartmentDashboard";

/**
 * Every shell route is this thin on purpose (spec 0012, AC-2): the page knows
 * which component to mount and nothing else. All five pages exist once, as
 * shared components, so a bespoke portal can mount the same ones and no
 * implementation lives twice.
 */
export default function DepartmentDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <DepartmentShellGate>
      {(shell) => (
        <DepartmentDashboard
          departmentId={shell.department._id}
          departmentName={shell.department.name}
          basePath={`/areas-of-service/${slug}`}
          canViewRoster={shell.can.viewRoster}
        />
      )}
    </DepartmentShellGate>
  );
}
