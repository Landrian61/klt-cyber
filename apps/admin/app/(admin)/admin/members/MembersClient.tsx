"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
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

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function MembersClient() {
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
      ["Name", "Phone", "Occupation", "Joined"],
      filtered.map(({ profile }) => [
        fullName(profile),
        profile.phone ?? "",
        profile.occupation ?? "",
        profile.joinDate ? new Date(profile.joinDate).toLocaleDateString() : "",
      ]),
    );
  }

  const columns: Column<MemberEntry>[] = [
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
