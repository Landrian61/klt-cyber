"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthQuery } from "@/lib/useAuthQuery";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/api";
import {
  ACTIVITY_FILTERS,
  activitySubjectId,
  describeActivity,
} from "@/lib/activity";
import { displayName, formatRelativeTime } from "@/lib/format";
import { Heading } from "@/components/ui/Heading";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar, FilterChip } from "@/components/ui/FilterBar";
import { Pagination } from "@/components/ui/Pagination";

// Row shape comes straight from the Convex query — no hand-rolled drift.
type ActivityResult = NonNullable<
  FunctionReturnType<typeof api.admin.listRecentActivity>
>;
type ActivityRow = ActivityResult["entries"][number];

const PAGE_SIZE = 25;

/** Actual first/last name for avatar initials; null lets email drive them. */
function nameOf(actor: ActivityRow["actor"]): string | null {
  if (!actor) return null;
  const name = `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim();
  return name || null;
}

export function ActivityClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth — shareable, bookmarkable filter state.
  const filterParam = searchParams.get("filter") ?? "all";
  const selectedFilter =
    ACTIVITY_FILTERS.find((entry) => entry.key === filterParam) ??
    ACTIVITY_FILTERS[0];
  const page = Math.max(
    Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
    1
  );

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // A filter change starts back at page 1.
      if (!("page" in patch)) params.delete("page");
      // Omit params sitting at their defaults — keep URLs clean.
      if (params.get("filter") === "all") params.delete("filter");
      if (params.get("page") === "1") params.delete("page");
      const qs = params.toString();
      router.replace(
        qs ? `/system-admin/activity?${qs}` : "/system-admin/activity",
        { scroll: false }
      );
    },
    [router, searchParams]
  );

  const result = useAuthQuery(api.admin.listRecentActivity, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    actionFilter: selectedFilter.actions.length
      ? selectedFilter.actions
      : undefined,
  });

  const columns: Column<ActivityRow>[] = [
    {
      key: "when",
      header: "When",
      render: (row) => (
        <span
          className="whitespace-nowrap text-on-surface-variant"
          title={new Date(row._creationTime).toLocaleString()}
        >
          {formatRelativeTime(row._creationTime)}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar
            name={nameOf(row.actor)}
            email={row.actor?.email}
            src={row.actor?.profilePictureUrl}
            size="sm"
          />
          <span className="whitespace-nowrap">{displayName(row.actor)}</span>
        </div>
      ),
    },
    {
      key: "event",
      header: "Event",
      render: (row) => (
        <span className="text-on-surface">{describeActivity(row)}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => <Badge variant="neutral">{row.action}</Badge>,
    },
  ];

  const pageCount = result ? Math.ceil(result.total / PAGE_SIZE) : 0;
  const rangeStart = result && result.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = result ? Math.min(page * PAGE_SIZE, result.total) : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Activity Log
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          The administrative audit trail — every recorded event.
          {result && (
            <>
              {" "}
              · <span className="font-mono">{result.total}</span> events
            </>
          )}
        </p>
      </header>

      <FilterBar
        showClear={selectedFilter.key !== "all"}
        onClearAll={() => setParams({ filter: "" })}
      >
        {ACTIVITY_FILTERS.map((entry) => (
          <FilterChip
            key={entry.key}
            selected={entry.key === selectedFilter.key}
            onClick={() =>
              setParams({
                filter:
                  entry.key === "all" || entry.key === selectedFilter.key
                    ? ""
                    : entry.key,
              })
            }
          >
            {entry.label}
          </FilterChip>
        ))}
      </FilterBar>

      <DataTable<ActivityRow>
        columns={columns}
        rows={result?.entries}
        rowKey={(row) => row._id}
        onRowClick={(row) => {
          const subjectId = activitySubjectId(row);
          if (subjectId) router.push(`/system-admin/users/${subjectId}`);
        }}
        empty={
          <EmptyState
            title="No events of this kind yet"
            message="They&apos;ll appear here as the community grows."
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
