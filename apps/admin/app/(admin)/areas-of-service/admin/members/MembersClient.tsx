"use client";

import { useMemo, useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/shadcn/sheet";
import { Skeleton } from "@/components/shadcn/skeleton";
import { ProfileDetails } from "../verification/ProfileDetails";
import { downloadCsv } from "../csv";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";


const PAGE_SIZE = 10;
const ALL = "all";



type MemberEntry = NonNullable <
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

type SortKey = "name" | "sex" | "marital" | "clan" | "verified";

export function MembersClient() {
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);
  const clans = useAuthQuery(api.clans.listClans);
  const departments = useAuthQuery(api.departments.listDepartments);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sexFilter, setSexFilter] = useState(ALL);
  const [maritalFilter, setMaritalFilter] = useState(ALL);
  const [clanFilter, setClanFilter] = useState(ALL);
  const [departmentFilter, setDepartmentFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedProfileId, setSelectedProfileId] =
    useState<Id<"memberProfiles"> | null>(null);

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

  function membershipLabel(
    membership: MemberEntry["departmentMemberships"][number],
  ) {
    const dept =
      departmentNameById.get(membership.departmentId) ?? "Department";
    return membership.positionTitle
      ? `${dept} · ${membership.positionTitle}`
      : dept;
  }


    const activeFilterCount = [
      sexFilter,
      maritalFilter,
      clanFilter,
      departmentFilter,
    ].filter((v) => v !== ALL).length;

    function clearFilters() {
      setSexFilter(ALL);
      setMaritalFilter(ALL);
      setClanFilter(ALL);
      setDepartmentFilter(ALL);
      setPage(1);
    }

  // A member's full set of department IDs — leadership roles scoped to a
  // department plus ordinary roster membership — used by both the Area of
  // Service filter and the badge list, so "filtered by department X" and
  // "badges shown" can never disagree about what counts.
  function memberDepartmentIds(entry: MemberEntry): Set<Id<"departments">> {
    const ids = new Set<Id<"departments">>();
    entry.activeRoles.forEach((r) => r.departmentId && ids.add(r.departmentId));
    entry.departmentMemberships.forEach((m) => ids.add(m.departmentId));
    return ids;
  }

  const filtered = useMemo(() => {
    if (!members) return undefined;
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (q && !fullName(m.profile).toLowerCase().includes(q)) return false;
      if (sexFilter !== ALL && m.profile.sex !== sexFilter) return false;
      if (maritalFilter !== ALL && m.profile.maritalStatus !== maritalFilter)
        return false;
      if (clanFilter !== ALL && m.profile.clanId !== clanFilter) return false;
      if (
        departmentFilter !== ALL &&
        !memberDepartmentIds(m).has(departmentFilter as Id<"departments">)
      )
        return false;
      return true;
    });
  }, [members, search, sexFilter, maritalFilter, clanFilter, departmentFilter]);

  const sorted = useMemo(() => {
    if (!filtered) return undefined;
    if (!sortKey) return filtered;
    const dir = sortDirection === "asc" ? 1 : -1;
    const withKey = (entry: MemberEntry): string => {
      switch (sortKey) {
        case "name":
          return fullName(entry.profile);
        case "sex":
          return entry.profile.sex;
        case "marital":
          return entry.profile.maritalStatus;
        case "clan":
          return entry.profile.clanId
            ? clanNameById.get(entry.profile.clanId) ?? ""
            : "";
        case "verified":
          return entry.profile.verifiedAt
            ? String(entry.profile.verifiedAt)
            : "";
      }
    };
    return [...filtered].sort((a, b) =>
      withKey(a).localeCompare(withKey(b)) * dir,
    );
  }, [filtered, sortKey, sortDirection, clanNameById]);

  function handleSortChange(key: string) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key as SortKey);
      setSortDirection("asc");
    }
  }

  const totalPages = sorted
    ? Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
    : 1;
  const clampedPage = Math.min(page, totalPages);
  const paginated = sorted?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function handleExport() {
    if (!sorted) return;
    downloadCsv(
      "members.csv",
      ["Name", "Sex", "Marital status", "Clan", "Area(s) of Service", "Verified"],
      sorted.map(({ profile, activeRoles, departmentMemberships }) => [
        fullName(profile),
        profile.sex,
        profile.maritalStatus,
        profile.clanId ? clanNameById.get(profile.clanId) ?? "" : "",
        [
          ...activeRoles.map(roleLabel),
          ...departmentMemberships.map(membershipLabel),
        ].join("; "),
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
      sortable: true,
      render: ({ profile }) => (
        <span className="font-medium text-on-surface">
          {fullName(profile)}
        </span>
      ),
    },
    {
      key: "sex",
      header: "Sex",
      sortable: true,
      render: ({ profile }) => (
        <span className="capitalize text-on-surface-variant">
          {profile.sex}
        </span>
      ),
    },
    {
      key: "marital",
      header: "Marital",
      sortable: true,
      render: ({ profile }) => (
        <span className="capitalize text-on-surface-variant">
          {profile.maritalStatus}
        </span>
      ),
    },
    {
      key: "clan",
      header: "Clan",
      sortable: true,
      render: ({ profile }) => (
        <span className="text-on-surface-variant">
          {profile.clanId ? clanNameById.get(profile.clanId) ?? "—" : "—"}
        </span>
      ),
    },
    {
      key: "areaOfService",
      header: "Area(s) of Service",
      render: ({ activeRoles, departmentMemberships }) =>
        activeRoles.length === 0 && departmentMemberships.length === 0 ? (
          <span className="text-on-surface-variant">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeRoles.map((role) => (
              <Badge key={role._id} variant="role">
                {roleLabel(role)}
              </Badge>
            ))}
            {departmentMemberships.map((membership) => (
              <Badge key={membership._id} variant="neutral">
                {membershipLabel(membership)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "verified",
      header: "Verified",
      sortable: true,
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
  const rangeEnd = sorted
    ? Math.min(clampedPage * PAGE_SIZE, sorted.length)
    : 0;

  const selectedProfile = useAuthQuery(
    api.memberProfiles.getProfileForReview,
    selectedProfileId ? { profileId: selectedProfileId } : "skip",
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Members
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          {sorted ? (
            <span className="font-mono">{sorted.length}</span>
          ) : (
            <span aria-hidden="true">—</span>
          )}{" "}
          verified members
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          defaultValue={search}
          onDebouncedChange={updateSearch}
          placeholder="Search by name…"
          className="w-56"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5">
              <SlidersHorizontal className="size-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="role" className="ml-1 px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-4" align="start">
            <div className="flex items-center justify-between">
              <p className="font-body text-sm font-semibold text-on-surface">
                Filter members
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-body text-xs text-primary underline underline-offset-2"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="font-body text-xs uppercase tracking-wide text-outline">
                Sex
              </p>
              <Select
                value={sexFilter}
                onValueChange={(v) => updateFilter(setSexFilter, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sexes</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="font-body text-xs uppercase tracking-wide text-outline">
                Marital status
              </p>
              <Select
                value={maritalFilter}
                onValueChange={(v) => updateFilter(setMaritalFilter, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All marital statuses</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="font-body text-xs uppercase tracking-wide text-outline">
                Clan
              </p>
              <Select
                value={clanFilter}
                onValueChange={(v) => updateFilter(setClanFilter, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All clans</SelectItem>
                  {clans?.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="font-body text-xs uppercase tracking-wide text-outline">
                Area of service
              </p>
              <Select
                value={departmentFilter}
                onValueChange={(v) => updateFilter(setDepartmentFilter, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All areas of service</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          onClick={handleExport}
          disabled={!sorted || sorted.length === 0}
          className="ml-auto"
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <DataTable<MemberEntry>
        columns={columns}
        rows={paginated}
        rowKey={({ profile }) => profile._id}
        onRowClick={({ profile }) => setSelectedProfileId(profile._id)}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        empty={
          <EmptyState
            title="No members match your search"
            message="Try different filters, or clear the search field."
          />
        }
      />

      {sorted && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-xs text-outline">
            Showing <span className="font-mono">{rangeStart}</span>–
            <span className="font-mono">{rangeEnd}</span> of{" "}
            <span className="font-mono">{sorted.length}</span>
          </p>
          <Pagination
            page={clampedPage}
            pageCount={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      <Sheet
        open={selectedProfileId !== null}
        onOpenChange={(open) => !open && setSelectedProfileId(null)}
      >
        <SheetContent className="overflow-y-auto bg-surface-low sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {selectedProfile ? fullName(selectedProfile) : "Member"}
            </SheetTitle>
            <SheetDescription>Full submitted profile</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {selectedProfile === undefined ? (
              <div className="flex flex-col gap-3" aria-busy="true">
                <Skeleton className="h-24 rounded-md" />
                <Skeleton className="h-40 rounded-md" />
                <Skeleton className="h-32 rounded-md" />
              </div>
            ) : selectedProfile === null ? (
              <p className="font-body text-sm text-on-surface-variant">
                Profile unavailable.
              </p>
            ) : (
              <ProfileDetails profile={selectedProfile} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}