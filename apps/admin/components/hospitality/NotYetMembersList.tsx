"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { UserRound } from "lucide-react";
import { VISITOR_KIND_LABELS } from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthPaginatedQuery } from "@/lib/useAuthPaginatedQuery";
import { Button } from "@/components/ui/Button";
import { type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import { formatDateKey, formatMoment } from "./hospitalityErrors";

type Row = FunctionReturnType<
  typeof api.hospitality.listNotYetMembers
>["page"][number];

const PAGE_SIZE = 25;

/**
 * "Not yet a member" (AC-30, H4-03): people with an app account who have not
 * started their member profile, longest waiting first. Rows without a
 * profile are picked after the server reads a page, so a page can come back
 * short; this keeps loading until a page's worth arrives or the list ends.
 */
export function NotYetMembersList({ base }: { base: string }) {
  const router = useRouter();
  const { results, status, loadMore } = useAuthPaginatedQuery(
    api.hospitality.listNotYetMembers,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const [target, setTarget] = useState(PAGE_SIZE);
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < target) loadMore(PAGE_SIZE);
  }, [status, results.length, target, loadMore]);

  const rows = status === "LoadingFirstPage" ? undefined : (results as Row[]);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Person",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-medium text-on-surface">
            {row.displayName}
          </p>
          <p className="truncate font-body text-xs text-on-surface-variant">
            {row.email}
          </p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Came from",
      render: (row) => (
        <span className="font-body text-sm text-on-surface-variant">
          {VISITOR_KIND_LABELS[row.kind]}
        </span>
      ),
    },
    {
      key: "since",
      header: "On the list since",
      render: (row) => (
        <span className="font-mono text-sm text-on-surface-variant">
          {formatMoment(row.createdAt)}
        </span>
      ),
    },
    {
      key: "visits",
      header: "Visits",
      align: "right",
      render: (row) => (
        <span className="font-mono text-sm text-on-surface">{row.visitCount}</span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="font-body text-sm text-on-surface-variant">
        They have the app but have not started their member profile. A friendly
        nudge from the team often helps.
      </p>
      <ResponsiveTable<Row>
        columns={columns}
        rows={rows}
        rowKey={(row) => row._id}
        skeletonRows={4}
        onRowClick={(row) => router.push(`${base}/${row._id}`)}
        card={(row) => (
          <Link href={`${base}/${row._id}`} className="block rounded-md">
            <RowCard>
              <p className="truncate font-body text-sm font-medium text-on-surface">
                {row.displayName}
              </p>
              <p className="truncate font-body text-xs text-on-surface-variant">
                {row.email}
              </p>
              <p className="mt-2 font-body text-xs text-on-surface-variant">
                {VISITOR_KIND_LABELS[row.kind]} ·{" "}
                <span className="font-mono">{row.visitCount}</span>{" "}
                {row.visitCount === 1 ? "visit" : "visits"}, last{" "}
                <span className="font-mono">{formatDateKey(row.lastVisitDate)}</span>
              </p>
            </RowCard>
          </Link>
        )}
        empty={
          <EmptyState
            icon={<UserRound className="h-5 w-5" aria-hidden />}
            title="Nobody is waiting"
            message="Everyone with the app has started their member profile."
          />
        }
      />
      {status === "CanLoadMore" && results.length >= target && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTarget(results.length + PAGE_SIZE)}
          >
            Show more
          </Button>
        </div>
      )}
      {(status === "LoadingMore" ||
        (status === "CanLoadMore" && results.length < target)) && (
        <p
          className="text-center font-body text-sm text-on-surface-variant"
          aria-live="polite"
        >
          Loading more…
        </p>
      )}
    </div>
  );
}
