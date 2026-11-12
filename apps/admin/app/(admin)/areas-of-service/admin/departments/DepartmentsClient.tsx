"use client";

import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { type Column } from "@/components/ui/DataTable";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";

// Every department with who leads it (spec 0021, AC-5, SRS A3-06). "No HOD" is
// crimson because a department nobody heads is the thing Administration needs
// to notice. A delegate is not a leader. Paused departments sit at the bottom,
// marked "Coming soon", and are never flagged.

type DepartmentRow = NonNullable<
  FunctionReturnType<typeof api.departments.listForAdministration>
>[number];

function Leader({ row }: { row: DepartmentRow }) {
  if (row.paused) return <Badge variant="neutral">Coming soon</Badge>;
  if (!row.hod) {
    return <span className="font-body text-sm font-semibold text-error">No HOD</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <Avatar name={row.hod.name} src={row.hod.photoUrl ?? undefined} size="sm" />
      <span className="text-on-surface">{row.hod.name}</span>
    </span>
  );
}

function Count({ value }: { value: number }) {
  return <span className="font-mono text-on-surface-variant">{value}</span>;
}

export function DepartmentsClient() {
  const router = useRouter();
  const departments = useAuthQuery(api.departments.listForAdministration, {});
  const open = (row: DepartmentRow) =>
    router.push(`/areas-of-service/admin/departments/${row._id}`);

  const leaderless = departments?.filter((d) => !d.paused && !d.hod).length;

  const columns: Column<DepartmentRow>[] = [
    {
      key: "name",
      header: "Department",
      render: (row) => (
        <span className={row.paused ? "text-on-surface-variant" : "font-medium text-on-surface"}>
          {row.name}
        </span>
      ),
    },
    { key: "hod", header: "HOD", render: (row) => <Leader row={row} /> },
    {
      key: "delegates",
      header: "Delegates",
      align: "right",
      render: (row) => <Count value={row.delegateCount} />,
    },
    {
      key: "roster",
      header: "Verified roster",
      align: "right",
      render: (row) => <Count value={row.verifiedRosterCount} />,
    },
    {
      key: "claims",
      header: "Claims waiting",
      align: "right",
      render: (row) =>
        row.claimsWaiting > 0 ? (
          <Badge variant="pending">
            <span className="font-mono">{row.claimsWaiting}</span>
          </Badge>
        ) : (
          <Count value={0} />
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
          Who leads each Area of Service.
          {leaderless !== undefined && leaderless > 0 && (
            <>
              {" "}
              <span className="font-semibold text-error">
                <span className="font-mono">{leaderless}</span> without an HOD.
              </span>
            </>
          )}
        </p>
      </header>

      {departments === null ? (
        <EmptyState
          title="Not available"
          message="Departments are shown to Administration only."
        />
      ) : (
        <ResponsiveTable<DepartmentRow>
          columns={columns}
          rows={departments}
          rowKey={(row) => row._id}
          onRowClick={open}
          skeletonRows={5}
          card={(row) => (
            <RowCard onClick={() => open(row)}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-body text-sm font-semibold text-on-surface">{row.name}</p>
                <Leader row={row} />
              </div>
              <p className="mt-2 font-body text-xs text-on-surface-variant">
                <span className="font-mono">{row.delegateCount}</span> delegates ·{" "}
                <span className="font-mono">{row.verifiedRosterCount}</span> verified ·{" "}
                <span className="font-mono">{row.claimsWaiting}</span> waiting
              </p>
            </RowCard>
          )}
          empty={
            <EmptyState
              title="No departments found yet"
              message="The fixed Areas of Service will appear here once seeded."
            />
          }
        />
      )}
    </div>
  );
}
