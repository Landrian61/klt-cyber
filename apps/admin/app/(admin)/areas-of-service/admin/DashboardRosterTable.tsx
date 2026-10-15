"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Id } from "@/lib/api";
import { api } from "@/lib/api";
import type { MaritalStatus, Sex } from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/shadcn/sheet";
import { ProfileDetails } from "./verification/ProfileDetails";
import { downloadCsv } from "./csv";

const PAGE_SIZE = 10;

const LEADERSHIP_STAGE_LABEL: Record<string, string> = {
  not_enrolled: "Not enrolled",
  level_1: "Level 1",
  level_2: "Level 2",
  advanced: "Advanced",
  completed: "Completed",
};

export type RosterProfile = {
  _id: Id<"memberProfiles">;
  firstName: string;
  middleName?: string;
  lastName: string;
  profileStatus: "pending_verification" | "verified";
  sex: Sex;
  maritalStatus: MaritalStatus;
  clanId?: Id<"clans">;
  mentorshipStatus: "not_enrolled" | "enrolled" | "completed";
  leadershipStage: "not_enrolled" | "level_1" | "level_2" | "advanced" | "completed";
  departmentIds: Id<"departments">[];
};

function fullName(p: { firstName: string; middleName?: string; lastName: string }) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

type SortKey = "name" | "sex" | "marital" | "clan" | "status";

/**
 * Zone 4 — the actionable roster table. Filtering is entirely inherited
 * from Zone 1 (the `roster` array arrives already run through
 * `matchesDashboardFilters`, same predicate as the chart/KPI population) —
 * this component only adds a local name search, since names aren't part of
 * the shared filter predicate at all. Mirrors MembersClient.tsx's proven
 * DataTable + Pagination + row-click Sheet/ProfileDetails pattern.
 */
export function DashboardRosterTable({
  roster,
  clanNameById,
  departmentNameById,
}: {
  roster: RosterProfile[] | null | undefined;
  clanNameById: Map<Id<"clans">, string>;
  departmentNameById: Map<Id<"departments">, string>;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedProfileId, setSelectedProfileId] =
    useState<Id<"memberProfiles"> | null>(null);

  // `roster` is a new array every time Zone 1's filters change (matchesDashboardFilters
  // re-runs in the parent), so this is "did the upstream filters change" without this
  // component needing to know about the filters themselves — reset to page 1 whenever
  // that happens, so a page number from a previous, larger result set can't get stranded
  // and resurface once the filters widen again.
  useEffect(() => {
    setPage(1);
  }, [roster]);

  const filtered = useMemo(() => {
    if (!roster) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((p) => fullName(p).toLowerCase().includes(q));
  }, [roster, search]);

  const sorted = useMemo(() => {
    if (!filtered) return undefined;
    if (!sortKey) return filtered;
    const dir = sortDirection === "asc" ? 1 : -1;
    const withKey = (entry: RosterProfile): string => {
      switch (sortKey) {
        case "name":
          return fullName(entry);
        case "sex":
          return entry.sex;
        case "marital":
          return entry.maritalStatus;
        case "clan":
          return entry.clanId ? clanNameById.get(entry.clanId) ?? "" : "";
        case "status":
          return entry.profileStatus;
      }
    };
    return [...filtered].sort((a, b) => withKey(a).localeCompare(withKey(b)) * dir);
  }, [filtered, sortKey, sortDirection, clanNameById]);

  function handleSortChange(key: string) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key as SortKey);
      setSortDirection("asc");
    }
  }

  const totalPages = sorted ? Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)) : 1;
  const clampedPage = Math.min(page, totalPages);
  const paginated = sorted?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleExport() {
    if (!sorted) return;
    downloadCsv(
      "dashboard-roster.csv",
      [
        "Name",
        "Sex",
        "Marital status",
        "Clan",
        "Department(s)",
        "Verification status",
        "Mentorship",
        "Leadership stage",
      ],
      sorted.map((p) => [
        fullName(p),
        p.sex,
        p.maritalStatus,
        p.clanId ? clanNameById.get(p.clanId) ?? "" : "",
        p.departmentIds.map((id) => departmentNameById.get(id) ?? "").join("; "),
        p.profileStatus === "verified" ? "Verified" : "Pending",
        p.mentorshipStatus,
        LEADERSHIP_STAGE_LABEL[p.leadershipStage] ?? p.leadershipStage,
      ]),
    );
  }

  const columns: Column<RosterProfile>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (p) => (
        <span className="font-medium text-on-surface">{fullName(p)}</span>
      ),
    },
    {
      key: "sex",
      header: "Sex",
      sortable: true,
      render: (p) => <span className="capitalize text-on-surface-variant">{p.sex}</span>,
    },
    {
      key: "marital",
      header: "Marital",
      sortable: true,
      render: (p) => (
        <span className="capitalize text-on-surface-variant">{p.maritalStatus}</span>
      ),
    },
    {
      key: "clan",
      header: "Clan",
      sortable: true,
      render: (p) => (
        <span className="text-on-surface-variant">
          {p.clanId ? clanNameById.get(p.clanId) ?? "—" : "—"}
        </span>
      ),
    },
    {
      key: "departments",
      header: "Ministry",
      render: (p) =>
        p.departmentIds.length === 0 ? (
          <span className="text-on-surface-variant">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {p.departmentIds.map((id) => (
              <Badge key={id} variant="neutral">
                {departmentNameById.get(id) ?? "Department"}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "status",
      header: "Verification",
      sortable: true,
      render: (p) => (
        <Badge variant={p.profileStatus === "verified" ? "verified" : "pending"}>
          {p.profileStatus === "verified" ? "Verified" : "Pending"}
        </Badge>
      ),
    },
    {
      key: "mentorship",
      header: "Mentorship",
      render: (p) => (
        <span className="capitalize text-on-surface-variant">
          {p.mentorshipStatus.replace("_", " ")}
        </span>
      ),
    },
    {
      key: "leadership",
      header: "Leadership stage",
      render: (p) => (
        <span className="text-on-surface-variant">
          {LEADERSHIP_STAGE_LABEL[p.leadershipStage] ?? p.leadershipStage}
        </span>
      ),
    },
  ];

  const rangeStart = (clampedPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = sorted ? Math.min(clampedPage * PAGE_SIZE, sorted.length) : 0;

  const selectedProfile = useAuthQuery(
    api.memberProfiles.getProfileForReview,
    selectedProfileId ? { profileId: selectedProfileId } : "skip",
  );

  return (
    <Card className="gap-4 p-6">
      <CardHeader className="flex-row items-center justify-between gap-3 p-0">
        <div className="space-y-1">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Matching members
          </CardTitle>
          <p className="font-body text-sm text-on-surface-variant">
            {sorted ? <span className="font-mono">{sorted.length}</span> : "—"} people
            match the filters above.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput
            defaultValue={search}
            onDebouncedChange={updateSearch}
            placeholder="Search by name…"
            className="w-56"
          />
          <Button
            size="sm"
            onClick={handleExport}
            disabled={!sorted || sorted.length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <DataTable<RosterProfile>
          columns={columns}
          rows={paginated}
          rowKey={(p) => p._id}
          onRowClick={(p) => setSelectedProfileId(p._id)}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          empty={
            <EmptyState
              title="No members match"
              message="Try loosening a filter above."
            />
          }
        />

        {sorted && sorted.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
      </CardContent>

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
    </Card>
  );
}
