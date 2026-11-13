"use client";

import { Suspense, use } from "react";
import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { DepartmentDashboard } from "@/components/department/DepartmentDashboard";
import { HospitalityDashboard } from "@/components/hospitality/HospitalityDashboard";
import { LibraryDashboard } from "@/components/library/LibraryDashboard";

/**
 * Every shell route is this thin on purpose (spec 0012, AC-2): the page knows
 * which component to mount and nothing else. The other four pages exist once,
 * as shared components, so a bespoke portal can mount the same ones and no
 * implementation lives twice.
 *
 * The Dashboard is the ONE page a department may replace with its own (spec
 * 0012 AC-2, as amended by specs 0017 and 0025). Media does it from its own
 * portal directory; the Library and Hospitality do it from here, because they
 * are still served by this dynamic route. Every other department gets
 * `DepartmentDashboard`, unchanged.
 *
 * The branch reads the capability rather than the slug: the slug is a URL the
 * seed decides, and `manageLibrary` / `manageHospitality` are what actually
 * mean "this is the Library" / "this is Hospitality", which is also what each
 * dashboard's queries re-check on the server.
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
        ) : shell.can.manageHospitality ? (
          // Suspense because the period comes from the search params.
          <Suspense fallback={null}>
            <HospitalityDashboard
              departmentName={shell.department.name}
              basePath={basePath}
            />
          </Suspense>
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
