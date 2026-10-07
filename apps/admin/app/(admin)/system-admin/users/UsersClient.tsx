"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthQuery } from "@/lib/useAuthQuery";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/api";
import { displayName, formatRelativeTime, roleLabel } from "@/lib/format";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FilterBar,
  FilterChip,
  SegmentedFilter,
} from "@/components/ui/FilterBar";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";

// Row shapes come straight from the Convex query — no hand-rolled drift.
type UsersResult = NonNullable<FunctionReturnType<typeof api.admin.listUsers>>;
type UserRow = UsersResult["users"][number];

const PAGE_SIZE = 25;

/** Actual first/last name for avatar initials; null lets email drive them. */
function nameOf(user: UserRow["user"]): string | null {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || null;
}

export function UsersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth — shareable, bookmarkable filter state.
  const q = searchParams.get("q") ?? "";
  const role = searchParams.get("role") ?? "";
  const roles = searchParams.get("roles") ?? "";
  const status = searchParams.get("status") ?? "";
  const profile = searchParams.get("profile") ?? "";
  const sortParam = searchParams.get("sort");
  const sort =
    sortParam === "name" || sortParam === "email" ? sortParam : "recent";
  const page = Math.max(
    Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
    1
  );

  // Remount key for the (uncontrolled) SearchInput so "Clear filters"
  // visually empties it without fighting the debounce while typing.
  const [searchKey, setSearchKey] = useState(0);

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // Any filter/search/sort change starts back at page 1.
      if (!("page" in patch)) params.delete("page");
      // Omit params sitting at their defaults — keep URLs clean.
      if (params.get("sort") === "recent") params.delete("sort");
      if (params.get("page") === "1") params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `/system-admin/users?${qs}` : "/system-admin/users", {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  const clearAll = useCallback(() => {
    setSearchKey((key) => key + 1);
    router.replace("/system-admin/users", { scroll: false });
  }, [router]);

  const result = useAuthQuery(api.admin.listUsers, {
    search: q || undefined,
    filter: {
      role: role === "visitor" || role === "member" ? role : undefined,
      hasAnyRole:
        roles === "with" ? true : roles === "without" ? false : undefined,
      status:
        status === "active" || status === "suspended" ? status : undefined,
      profileCompleted:
        profile === "complete"
          ? true
          : profile === "incomplete"
            ? false
            : undefined,
    },
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasActiveFilters = Boolean(q || role || roles || status || profile);

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar
            name={nameOf(row.user)}
            email={row.user.email}
            src={row.user.profilePictureUrl}
            size="md"
          />
          <span className="font-medium text-on-surface">
            {displayName(row.user)}
          </span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      sortable: true,
      render: (row) => (
        <span className="text-on-surface-variant">{row.user.email}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={row.user.role}>
            {row.user.role === "member" ? "Member" : "Visitor"}
          </Badge>
          {row.user.status === "suspended" && (
            <Badge variant="suspended">Suspended</Badge>
          )}
          {row.activeRoles.map((assignment) => (
            <Badge key={assignment._id} variant="role">
              {roleLabel(assignment.roleType, assignment.clanName)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "recent",
      header: "Signed up",
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap text-on-surface-variant">
          {formatRelativeTime(row.signedUpAt)}
        </span>
      ),
    },
  ];

  const pageCount = result ? Math.ceil(result.total / PAGE_SIZE) : 0;
  const rangeStart = result ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = result
    ? Math.min(result.page * PAGE_SIZE, result.total)
    : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Users
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          {result ? (
            <span className="font-mono">{result.total}</span>
          ) : (
            <span aria-hidden="true">—</span>
          )}{" "}
          accounts on record
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          key={searchKey}
          defaultValue={q}
          onDebouncedChange={(value) => setParams({ q: value })}
          placeholder="Search by name or email…"
          className="min-w-64 flex-1"
        />
        <div className="w-44">
          <Select
            value={sort}
            onValueChange={(value) => setParams({ sort: value })}
          >
            <SelectTrigger aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <FilterBar showClear={hasActiveFilters} onClearAll={clearAll}>
        <SegmentedFilter
          ariaLabel="Lifecycle"
          options={[
            { value: "", label: "All" },
            { value: "visitor", label: "Visitors" },
            { value: "member", label: "Members" },
          ]}
          value={role}
          onChange={(value) => setParams({ role: value })}
        />
        <SegmentedFilter
          ariaLabel="Account status"
          options={[
            { value: "", label: "All" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
          ]}
          value={status}
          onChange={(value) => setParams({ status: value })}
        />
        <FilterChip
          selected={roles === "with"}
          onClick={() => setParams({ roles: roles === "with" ? "" : "with" })}
        >
          With roles
        </FilterChip>
        <FilterChip
          selected={roles === "without"}
          onClick={() =>
            setParams({ roles: roles === "without" ? "" : "without" })
          }
        >
          No roles
        </FilterChip>
        <FilterChip
          selected={profile === "complete"}
          onClick={() =>
            setParams({ profile: profile === "complete" ? "" : "complete" })
          }
        >
          Profile completed
        </FilterChip>
        <FilterChip
          selected={profile === "incomplete"}
          onClick={() =>
            setParams({ profile: profile === "incomplete" ? "" : "incomplete" })
          }
        >
          Incomplete
        </FilterChip>
      </FilterBar>

      <DataTable<UserRow>
        columns={columns}
        rows={result?.users}
        rowKey={(row) => row.user._id}
        onRowClick={(row) => router.push(`/system-admin/users/${row.user._id}`)}
        sortKey={sort}
        sortDirection={sort === "recent" ? "desc" : "asc"}
        onSortChange={(key) => setParams({ sort: key })}
        empty={
          <EmptyState
            title="No one matches those filters"
            message="Try widening your search or clearing the filters."
            action={
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            }
          />
        }
      />

      {result && result.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-xs text-outline">
            Showing <span className="font-mono">{rangeStart}</span>–
            <span className="font-mono">{rangeEnd}</span> of{" "}
            <span className="font-mono">{result.total}</span>
          </p>
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={(next) => setParams({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
