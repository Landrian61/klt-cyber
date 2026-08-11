"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { downloadCsv } from "../../csv";

const PAGE_SIZE = 10;

// Row shape comes straight from the Convex query — no hand-rolled drift.
type MemberProfile = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listVerifiedMembersWithRoles>
>[number]["profile"];

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

  const departments = useAuthQuery(api.departments.listDepartments);
  const membership = useAuthQuery(api.departmentMemberships.listDepartmentMembers, {
    departmentId: id,
  });
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const department = departments?.find((d) => d._id === id);

  const profileByUserId = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof members>[number]["profile"]
    >();
    members?.forEach((m) => map.set(m.profile.userId, m.profile));
    return map;
  }, [members]);

  // listDepartmentMembers only returns bare membership rows (userId, no
  // name/phone/occupation) — join against the verified-members map to get
  // displayable profile fields. Rows whose userId isn't found are skipped.
  const departmentMembers = useMemo(() => {
    if (!membership || !members) return undefined;
    const q = search.trim().toLowerCase();
    const joined = membership
      .map((m) => profileByUserId.get(m.userId))
      .filter((profile): profile is NonNullable<typeof profile> => !!profile);
    return joined.filter((profile) => !q || fullName(profile).toLowerCase().includes(q));
  }, [membership, members, profileByUserId, search]);

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
      departmentMembers.map((profile) => [
        fullName(profile),
        profile.phone ?? "",
        profile.occupation ?? "",
        profile.joinDate ? new Date(profile.joinDate).toLocaleDateString() : "",
      ]),
    );
  }

  if (departments !== undefined && !department) {
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

  const columns: Column<MemberProfile>[] = [
    {
      key: "name",
      header: "Name",
      render: (profile) => (
        <span className="font-medium text-on-surface">
          {fullName(profile)}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: (profile) => (
        <span className="text-on-surface-variant">{profile.phone ?? "—"}</span>
      ),
    },
    {
      key: "occupation",
      header: "Occupation",
      render: (profile) => (
        <span className="text-on-surface-variant">
          {profile.occupation ?? "—"}
        </span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (profile) => (
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

      <DataTable<MemberProfile>
        columns={columns}
        rows={paginated}
        rowKey={(profile) => profile._id}
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
