"use client";

import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { downloadCsv } from "../csv";

const PAGE_SIZE = 10;

// Row shape comes straight from the Convex query — no hand-rolled drift.
type MemberEntry = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listVerifiedMembersWithRoles>
>[number];

const ROLE_LABELS: Record<MemberEntry["activeRoles"][number]["roleType"], string> = {
  system_admin: "System Admin",
  clan_elder: "Clan Elder",
  hod: "HOD",
  department_admin: "Department Admin",
};

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function MembersClient() {
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);
  const clans = useAuthQuery(api.clans.listClans);
  const departments = useAuthQuery(api.departments.listDepartments);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const clanNameById = useMemo(() => {
    const map = new Map<Id<"clans">, string>();
    clans?.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [clans]);

  const departmentNameById = useMemo(() => {
    const map = new Map<Id<"departments">, string>();
    departments?.forEach((d) => map.set(d._id, d.name));
    return map;
  }, [departments]);

  // `activeRoles` only covers leadership roles (system_admin, clan_elder,
  // hod, department_admin) — convex/memberProfiles.ts does not yet join
  // `departmentMemberships`, so an ordinary member serving in a department
  // with no leadership role shows no roles here. Real "area(s) of service"
  // per the spec needs that join added server-side; this is a known gap.
  function roleLabel(role: MemberEntry["activeRoles"][number]) {
    const base = ROLE_LABELS[role.roleType];
    if (role.departmentId) {
      const dept = departmentNameById.get(role.departmentId);
      return dept ? `${base} · ${dept}` : base;
    }
    if (role.clanId) {
      const clan = clanNameById.get(role.clanId);
      return clan ? `${base} · ${clan}` : base;
    }
    return base;
  }

  const filtered = useMemo(() => {
    if (!members) return undefined;
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const matchesSearch = !q || fullName(m.profile).toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [members, search]);

  const totalPages = filtered
    ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    : 1;
  const clampedPage = Math.min(page, totalPages);
  const paginated = filtered?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleExport() {
    if (!filtered) return;
    downloadCsv(
      "members.csv",
      ["Name", "Sex", "Marital status", "Clan", "Leadership roles", "Verified"],
      filtered.map(({ profile, activeRoles }) => [
        fullName(profile),
        profile.sex,
        profile.maritalStatus,
        profile.clanId ? clanNameById.get(profile.clanId) ?? "" : "",
        activeRoles.map(roleLabel).join("; "),
        profile.verifiedAt
          ? new Date(profile.verifiedAt).toLocaleDateString()
          : "",
      ]),
    );
  }

  const columns: Column<MemberEntry>[] = [
    {
      key: "photo",
      header: "Photo",
      render: ({ profile }) => <Avatar name={fullName(profile)} size="md" />,
    },
    {
      key: "name",
      header: "Name",
      render: ({ profile }) => (
        <span className="font-medium text-on-surface">
          {fullName(profile)}
        </span>
      ),
    },
    {
      key: "sex",
      header: "Sex",
      render: ({ profile }) => (
        <span className="capitalize text-on-surface-variant">
          {profile.sex}
        </span>
      ),
    },
    {
      key: "marital",
      header: "Marital",
      render: ({ profile }) => (
        <span className="capitalize text-on-surface-variant">
          {profile.maritalStatus}
        </span>
      ),
    },
    {
      key: "clan",
      header: "Clan",
      render: ({ profile }) => (
        <span className="text-on-surface-variant">
          {profile.clanId ? clanNameById.get(profile.clanId) ?? "—" : "—"}
        </span>
      ),
    },
    {
      key: "areaOfService",
      header: "Area(s) of Service",
      render: ({ activeRoles }) =>
        activeRoles.length === 0 ? (
          <span className="text-on-surface-variant">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeRoles.map((role, i) => (
              <Badge key={i} variant="role">
                {roleLabel(role)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "verified",
      header: "Verified",
      render: ({ profile }) => (
        <span className="whitespace-nowrap text-on-surface-variant">
          {profile.verifiedAt
            ? new Date(profile.verifiedAt).toLocaleDateString()
            : "—"}
        </span>
      ),
    },
  ];

  const rangeStart = (clampedPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = filtered
    ? Math.min(clampedPage * PAGE_SIZE, filtered.length)
    : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Members
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          {filtered ? (
            <span className="font-mono">{filtered.length}</span>
          ) : (
            <span aria-hidden="true">—</span>
          )}{" "}
          verified members
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-md bg-surface-low p-3 text-on-surface-variant">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="font-body text-xs">
          &quot;Area(s) of Service&quot; currently shows leadership roles
          only (System Admin, HOD, Department Admin, Clan Elder). Ordinary
          department membership isn&apos;t joined into this view yet.
        </p>
      </div>

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
          disabled={!filtered || filtered.length === 0}
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <DataTable<MemberEntry>
        columns={columns}
        rows={paginated}
        rowKey={({ profile }) => profile._id}
        empty={
          <EmptyState
            title="No members match your search"
            message="Try a different name, or clear the search field."
          />
        }
      />

      {filtered && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-xs text-outline">
            Showing <span className="font-mono">{rangeStart}</span>–
            <span className="font-mono">{rangeEnd}</span> of{" "}
            <span className="font-mono">{filtered.length}</span>
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