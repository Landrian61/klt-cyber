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
import { type Column } from "@/components/ui/DataTable";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import { MENTORSHIP_STATUS_LABEL } from "@klt-cyber/shared";
import {
  ColumnPicker,
  useColumnVisibility,
  type PickableColumn,
} from "@/components/ui/ColumnPicker";
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

// What the Columns menu offers. Name is always shown, so a row is never
// unidentifiable. Mentorship starts hidden: it is also a filter, and the
// table is wide enough already.
const PICKABLE_COLUMNS: PickableColumn[] = [
  { key: "photo", label: "Photo" },
  { key: "name", label: "Name", locked: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "sex", label: "Sex" },
  { key: "marital", label: "Marital status" },
  { key: "clan", label: "Clan" },
  { key: "mentorship", label: "Mentorship" },
  { key: "areaOfService", label: "Area(s) of service" },
  { key: "verified", label: "Verified" },
];
const DEFAULT_HIDDEN_COLUMNS = ["mentorship"];
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
  const [mentorshipFilter, setMentorshipFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const columnState = useColumnVisibility(
    "klt.admin.members.columns",
    PICKABLE_COLUMNS,
    DEFAULT_HIDDEN_COLUMNS,
  );
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
      mentorshipFilter,
    ].filter((v) => v !== ALL).length;

    function clearFilters() {
      setSexFilter(ALL);
      setMaritalFilter(ALL);
      setClanFilter(ALL);
      setDepartmentFilter(ALL);
      setMentorshipFilter(ALL);
      setPage(1);
    }

  /**
   * Everything a member serves in, as labels: leadership roles first, then
   * roster seats. Deduplicated by label, because Convex has no unique indexes
   * and one person can hold two identical active rows (the same delegate seat
   * twice, say); showing it twice says nothing new.
   */
  function serviceAreas(entry: MemberEntry): { label: string; leader: boolean }[] {
    const seen = new Set<string>();
    const out: { label: string; leader: boolean }[] = [];
    for (const role of entry.activeRoles) {
      const label = roleLabel(role);
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, leader: true });
    }
    for (const membership of entry.departmentMemberships) {
      const label = membershipLabel(membership);
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, leader: false });
    }
    return out;
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
      if (
        mentorshipFilter !== ALL &&
        m.profile.mentorshipStatus !== mentorshipFilter
      )
        return false;
      return true;
    });
  }, [
    members,
    search,
    sexFilter,
    maritalFilter,
    clanFilter,
    departmentFilter,
    mentorshipFilter,
  ]);

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
      [
        "Name",
        "Phone",
        "Email",
        "Sex",
        "Marital status",
        "Clan",
        "Mentorship",
        "Area(s) of Service",
        "Verified",
      ],
      // Contact details are for Administration (SRS §3.5, spec 0021 AC-3).
      // Age and date of birth stay out of the export, as they stay out of
      // the table.
      sorted.map((entry) => {
        const { profile, email } = entry;
        return [
        fullName(profile),
        profile.phone ?? "",
        email ?? "",
        profile.sex,
        profile.maritalStatus,
        profile.clanId ? clanNameById.get(profile.clanId) ?? "" : "",
        MENTORSHIP_STATUS_LABEL[profile.mentorshipStatus] ?? profile.mentorshipStatus,
        serviceAreas(entry)
          .map((area) => area.label)
          .join("; "),
        profile.verifiedAt
          ? new Date(profile.verifiedAt).toLocaleDateString()
          : "",
        ];
      }),
    );
  }

  const allColumns: Column<MemberEntry>[] = [
    {
      key: "photo",
      header: "Photo",
      render: ({ profile, photoUrl }) => (
        <Avatar name={fullName(profile)} src={photoUrl ?? undefined} size="md" />
      ),
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
      key: "phone",
      header: "Phone",
      render: ({ profile }) =>
        profile.phone ? (
          <a
            href={`tel:${profile.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap font-mono text-sm text-on-surface hover:text-primary"
          >
            {profile.phone}
          </a>
        ) : (
          <span className="text-on-surface-variant">—</span>
        ),
    },
    {
      key: "email",
      header: "Email",
      render: ({ email }) =>
        email ? (
          <a
            href={`mailto:${email}`}
            onClick={(e) => e.stopPropagation()}
            className="block max-w-[14rem] truncate text-sm text-on-surface hover:text-primary"
          >
            {email}
          </a>
        ) : (
          <span className="text-on-surface-variant">—</span>
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
      key: "mentorship",
      header: "Mentorship",
      render: ({ profile }) => (
        <span className="whitespace-nowrap text-on-surface-variant">
          {MENTORSHIP_STATUS_LABEL[profile.mentorshipStatus] ?? profile.mentorshipStatus}
        </span>
      ),
    },
    {
      key: "areaOfService",
      header: "Area(s) of Service",
      // One line, whatever someone holds: the first area, then a "+N" that
      // opens the full list. Leadership roles come first.
      render: (entry) => {
        const areas = serviceAreas(entry);
        if (areas.length === 0) {
          return <span className="text-on-surface-variant">—</span>;
        }
        const [first, ...rest] = areas;
        return (
          <div className="flex max-w-[16rem] items-center gap-1.5">
            <Badge variant={first.leader ? "role" : "neutral"} className="min-w-0 truncate">
              <span className="truncate" title={first.label}>
                {first.label}
              </span>
            </Badge>
            {rest.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Show all ${areas.length} areas of service`}
                    className="shrink-0 rounded-full bg-surface-high px-2 py-0.5 font-mono text-[11px] font-semibold text-on-surface-variant transition-colors hover:bg-primary-light hover:text-primary"
                  >
                    +{rest.length}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 space-y-2"
                  align="start"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="font-body text-xs font-semibold uppercase tracking-wide text-outline">
                    Areas of service
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {areas.map((area) => (
                      <li key={area.label}>
                        <Badge variant={area.leader ? "role" : "neutral"}>{area.label}</Badge>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
          </div>
        );
      },
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
  const columns = allColumns.filter((column) => columnState.isVisible(column.key));

  const rangeStart = (clampedPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = sorted
    ? Math.min(clampedPage * PAGE_SIZE, sorted.length)
    : 0;

  const selectedMember = members?.find(
    (m) => m.profile._id === selectedProfileId,
  );
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

            <div className="space-y-1.5">
              <p className="font-body text-xs uppercase tracking-wide text-outline">
                Mentorship
              </p>
              <Select
                value={mentorshipFilter}
                onValueChange={(v) => updateFilter(setMentorshipFilter, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All mentorship statuses</SelectItem>
                  {Object.entries(MENTORSHIP_STATUS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        <ColumnPicker columns={PICKABLE_COLUMNS} state={columnState} />

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

      <ResponsiveTable<MemberEntry>
        columns={columns}
        rows={paginated}
        rowKey={({ profile }) => profile._id}
        onRowClick={({ profile }) => setSelectedProfileId(profile._id)}
        card={(entry) => (
          <RowCard onClick={() => setSelectedProfileId(entry.profile._id)}>
            <div className="flex items-center gap-3">
              <Avatar
                name={fullName(entry.profile)}
                src={entry.photoUrl ?? undefined}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm font-semibold text-on-surface">
                  {fullName(entry.profile)}
                </p>
                <p className="font-body text-xs text-on-surface-variant">
                  {entry.profile.clanId
                    ? clanNameById.get(entry.profile.clanId) ?? "No clan"
                    : "No clan"}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2">
              <div>
                <dt className="font-body text-xs uppercase tracking-wide text-outline">
                  Phone
                </dt>
                <dd className="font-mono text-sm text-on-surface">
                  {entry.profile.phone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-body text-xs uppercase tracking-wide text-outline">
                  Email
                </dt>
                <dd className="truncate font-body text-sm text-on-surface">
                  {entry.email ?? "—"}
                </dd>
              </div>
            </dl>
          </RowCard>
        )}
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
        <SheetContent className="subtle-scrollbar overflow-y-auto bg-surface-low sm:max-w-xl">
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
              <div className="space-y-4">
                {selectedMember?.email && (
                  <div className="rounded-md bg-surface-lowest p-4 shadow-e1">
                    <p className="font-body text-xs uppercase tracking-wide text-outline">
                      Email
                    </p>
                    <a
                      href={`mailto:${selectedMember.email}`}
                      className="mt-1 block break-all font-body text-sm text-on-surface hover:text-primary"
                    >
                      {selectedMember.email}
                    </a>
                  </div>
                )}
                <ProfileDetails profile={selectedProfile} />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}