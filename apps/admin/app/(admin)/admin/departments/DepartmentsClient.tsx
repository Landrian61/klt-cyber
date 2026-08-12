"use client";

import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";

// Row shape comes straight from the Convex query — no hand-rolled drift.
type DepartmentRow = NonNullable<
  FunctionReturnType<typeof api.departments.listDepartments>
>[number];

export function DepartmentsClient() {
  const router = useRouter();
  const departments = useAuthQuery(api.departments.listDepartments);

  const columns: Column<DepartmentRow>[] = [
    {
      key: "name",
      header: "Department",
      render: (dept) => (
        <span className="font-medium text-on-surface">{dept.name}</span>
      ),
    },
    {
      key: "order",
      header: "Order",
      align: "right",
      render: (dept) => (
        <span className="font-mono text-on-surface-variant">{dept.order}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Departments
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          The <span className="font-mono">13</span> fixed Areas of Service.
        </p>
      </header>

      <DataTable<DepartmentRow>
        columns={columns}
        rows={departments}
        rowKey={(dept) => dept._id}
        onRowClick={(dept) => router.push(`/admin/departments/${dept._id}`)}
        skeletonRows={3}
        empty={
          <EmptyState
            title="No departments found yet"
            message="The fixed Areas of Service will appear here once seeded."
          />
        }
      />
    </div>
  );
}
