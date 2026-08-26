"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Avatar } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { downloadCsv } from "../../csv";

const PAGE_SIZE = 10;

// Row shape comes straight from the joined Convex query — no hand-rolled
// client-side join anymore (see convex/departmentMemberships.ts).
type MemberRow = NonNullable<
  FunctionReturnType<
    typeof api.departmentMemberships.listDepartmentMembersWithProfiles
  >
>["members"][number];
// `profile` is only ever null if a membership row outlives its profile
// (shouldn't happen — see the query's doc comment); narrowed away here so
// downstream rendering doesn't need to keep re-checking it.
type MemberRowWithProfile = MemberRow & {
  profile: NonNullable<MemberRow["profile"]>;
};

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function DepartmentMembersClient({
  departmentId,
}: {
  departmentId: string;
}) {
  const router = useRouter();
  const id = departmentId as Id<"departments">;

  // The roster query now returns its department alongside the rows, so this
  // no longer fetches all 13 departments just to read one name.
  const roster = useAuthQuery(
    api.departmentMemberships.listDepartmentMembersWithProfiles,
    { departmentId: id },
  );
  const rosterRows = roster?.members;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const department = roster?.department;

  const departmentMembers = useMemo(() => {
    if (!rosterRows) return undefined;
    const q = search.trim().toLowerCase();
    return rosterRows.filter(
      (row): row is MemberRowWithProfile =>
        row.profile !== null &&
        (!q || fullName(row.profile).toLowerCase().includes(q)),
    );
  }, [rosterRows, search]);

  const totalPages = departmentMembers
    ? Math.max(1, Math.ceil(departmentMembers.length / PAGE_SIZE))
    : 1;
  const clampedPage = Math.min(page, totalPages);
  const paginated = departmentMembers?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleExport() {
    if (!departmentMembers) return;
    downloadCsv(
      `${department?.name ?? "department"}-members.csv`,
      ["Name", "Phone", "Occupation", "Joined"],
      departmentMembers.map(({ profile }) => [
        fullName(profile),
        profile.phone ?? "",
        profile.occupation ?? "",
        profile.joinDate ? new Date(profile.joinDate).toLocaleDateString() : "",
      ]),
    );
  }

  // The query resolves to null when the id doesn't match a department, so the
  // server settles "not found" directly — no need to load every department
  // and check for a client-side match.
  if (roster === null) {
    return (
      <div className="space-y-6">
        <BackLink onClick={() => router.push("/admin/departments")} />
        <EmptyState
          title="Department not found"
          message="This department doesn't exist or may have been removed."
        />
      </div>
    );
  }

  const columns: Column<MemberRowWithProfile>[] = [
    {
      key: "name",
      header: "Name",
      render: ({ profile, user }) => (
        <div className="flex items-center gap-2.5">
          <Avatar
            name={fullName(profile)}
            src={profile.photoUrl ?? user?.profilePictureUrl}
            size="md"
          />
          <span className="font-medium text-on-surface">
            {fullName(profile)}
          </span>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: ({ profile }) => (
        <span className="text-on-surface-variant">{profile.phone ?? "—"}</span>
      ),
    },
    {
      key: "occupation",
      header: "Occupation",
      render: ({ profile }) => (
        <span className="text-on-surface-variant">
          {profile.occupation ?? "—"}
        </span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: ({ profile }) => (
        <span className="whitespace-nowrap text-on-surface-variant">
          {profile.joinDate
            ? new Date(profile.joinDate).toLocaleDateString()
            : "—"}
        </span>
      ),
    },
  ];

  const rangeStart = (clampedPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = departmentMembers
    ? Math.min(clampedPage * PAGE_SIZE, departmentMembers.length)
    : 0;

  return (
    <div className="space-y-6">
      <BackLink onClick={() => router.push("/admin/departments")} />

      <header className="space-y-1">
        {department ? (
          <Heading as="h1" size="2xl">
            {department.name}
          </Heading>
        ) : (
          <Skeleton className="h-9 w-56" />
        )}
        <p className="font-body text-base text-on-surface-variant">
          {departmentMembers ? (
            <span className="font-mono">{departmentMembers.length}</span>
          ) : (
            <span aria-hidden="true">—</span>
          )}{" "}
          members serving here
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          defaultValue={search}
          onDebouncedChange={updateSearch}
          placeholder="Search by name…"
          className="min-w-64 flex-1"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={!departmentMembers || departmentMembers.length === 0}
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <DataTable<MemberRowWithProfile>
        columns={columns}
        rows={paginated}
        rowKey={({ profile }) => profile._id}
        skeletonRows={3}
        empty={
          <EmptyState
            title="No members match your search"
            message="Nobody in this department matches — try a different name."
          />
        }
      />

      {departmentMembers && departmentMembers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-xs text-outline">
            Showing <span className="font-mono">{rangeStart}</span>–
            <span className="font-mono">{rangeEnd}</span> of{" "}
            <span className="font-mono">{departmentMembers.length}</span>
          </p>
          <Pagination
            page={clampedPage}
            pageCount={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

// Quiet text-link back affordance (matches the system-admin detail screens).
// Kept as a button so the existing router.push navigation is untouched.
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-block font-body text-sm text-primary underline underline-offset-2"
    >
      &larr; Departments
    </button>
  );
}
