"use client";

import { use } from "react";
import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentDashboard } from "@/components/department/DepartmentDashboard";
import { LibraryDashboard } from "@/components/library/LibraryDashboard";

/**
 * Every shell route is this thin on purpose (spec 0012, AC-2): the page knows
 * which component to mount and nothing else. The other four pages exist once,
 * as shared components, so a bespoke portal can mount the same ones and no
 * implementation lives twice.
 *
 * The Dashboard is the ONE page a department may replace with its own (spec
 * 0012 AC-2, as amended by spec 0017). Media does it from its own portal
 * directory; the Library does it from here, because it is still served by this
 * dynamic route. Every other department gets `DepartmentDashboard`, unchanged.
 *
 * The branch reads the capability rather than the slug: the slug is a URL the
 * seed decides and `manageLibrary` is the thing that actually means "this is
 * the Library", which is also what both dashboards' queries re-check on the
 * server.
 */
export default function DepartmentDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const basePath = `/areas-of-service/${slug}`;
  return (
    <DepartmentShellGate>
      {(shell) =>
        shell.can.manageLibrary ? (
          <LibraryDashboard
            departmentId={shell.department._id}
            departmentName={shell.department.name}
            basePath={basePath}
            canViewRoster={shell.can.viewRoster}
          />
        ) : (
          <DepartmentDashboard
            departmentId={shell.department._id}
            departmentName={shell.department.name}
            basePath={basePath}
            canViewRoster={shell.can.viewRoster}
          />
        )
      }
    </DepartmentShellGate>
  );
}
