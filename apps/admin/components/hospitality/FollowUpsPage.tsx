"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import {
  CONTACT_OUTCOME_LABELS,
  type FollowUpOutcome,
  type LOGGED_CONTACT_CHANNELS,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthPaginatedQuery } from "@/lib/useAuthPaginatedQuery";
import type { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/shadcn/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/ui/Button";
import { type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar, FilterChip, SegmentedFilter } from "@/components/ui/FilterBar";
import { Heading } from "@/components/ui/Heading";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import {
  AssignFollowUpDialog,
  CloseFollowUpDialog,
  ContactActions,
  LogContactDialog,
  type ContactTarget,
} from "./FollowUpActions";
import { formatDateKey, formatMoment } from "./hospitalityErrors";

type Row = FunctionReturnType<typeof api.hospitality.listFollowUps>["page"][number];
type LoggedChannel = (typeof LOGGED_CONTACT_CHANNELS)[number];
type Mode = "contact" | "log" | "assign" | "close";

const PAGE_SIZE = 25;

const DONE_LABELS: Record<FollowUpOutcome, string> = {
  reached: CONTACT_OUTCOME_LABELS.reached,
  wrong_number: CONTACT_OUTCOME_LABELS.wrong_number,
  do_not_contact: CONTACT_OUTCOME_LABELS.do_not_contact,
  closed: "Closed by hand",
};

function targetOf(row: Row): ContactTarget {
  return {
    visitorId: row.visitor._id,
    firstName: row.visitor.firstName,
    phone: row.visitor.phone,
    hasAccount: row.visitor.hasAccount,
    firstVisitDate: row.firstVisitDate,
    lastVisitDate: row.visitor.lastVisitDate,
  };
}

function Assignee({ row }: { row: Row }) {
  if (!row.assignedTo) return <Badge variant="pending">Unassigned</Badge>;
  return (
    <span className="font-body text-sm text-on-surface">
      {row.assignedToName}
      {row.assigneeFormer && (
        <span className="ml-1 font-body text-xs text-on-surface-variant">(former operator)</span>
      )}
    </span>
  );
}

/**
 * Follow ups (spec 0024, AC-16 to AC-20).
 *
 * Open: longest waiting first, with "Unassigned" called out and a Mine
 * filter. Done: most recently closed first, with how each one ended. Every
 * open row can be contacted in one tap, logged, assigned or closed.
 */
export function FollowUpsPage() {
  const { slug } = useParams<{ slug: string }>();
  const visitorsHref = `/areas-of-service/${slug}/visitors`;
  const [tab, setTab] = useState<"open" | "done">("open");
  const [mine, setMine] = useState(false);
  const { results, status, loadMore } = useAuthPaginatedQuery(
    api.hospitality.listFollowUps,
    { tab, mine: tab === "open" ? mine : undefined },
    { initialNumItems: PAGE_SIZE },
  );

  const [active, setActive] = useState<Row | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [channel, setChannel] = useState<LoggedChannel | undefined>(undefined);

  const open = (row: Row, next: Mode) => {
    setActive(row);
    setChannel(undefined);
    setMode(next);
  };
  const closeAll = () => setMode(null);

  const rows = status === "LoadingFirstPage" ? undefined : (results as Row[]);

  const actions = (row: Row) =>
    row.status === "open" ? (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => open(row, "contact")}>
          Contact
        </Button>
        <Button variant="secondary" size="sm" onClick={() => open(row, "assign")}>
          {row.assignedTo ? "Reassign" : "Assign"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => open(row, "close")}>
          Close
        </Button>
      </div>
    ) : null;

  const nameCell = (row: Row) => (
    <Link
      href={`${visitorsHref}/${row.visitor._id}`}
      className="font-body text-sm font-medium text-on-surface hover:underline"
    >
      {row.visitor.displayName}
    </Link>
  );

  const openColumns: Column<Row>[] = [
    { key: "name", header: "Visitor", render: nameCell },
    {
      key: "first",
      header: "First visit",
      render: (row) => (
        <span className="font-mono text-sm text-on-surface-variant">{formatDateKey(row.firstVisitDate)}</span>
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      align: "right",
      render: (row) => <span className="font-mono text-sm">{row.attemptCount}</span>,
    },
    { key: "assignee", header: "Assigned to", render: (row) => <Assignee row={row} /> },
    { key: "actions", header: "", render: actions },
  ];

  const doneColumns: Column<Row>[] = [
    { key: "name", header: "Visitor", render: nameCell },
    {
      key: "outcome",
      header: "Outcome",
      render: (row) => (
        <Badge variant={row.outcome === "reached" ? "verified" : "neutral"}>
          {DONE_LABELS[row.outcome ?? "closed"]}
        </Badge>
      ),
    },
    {
      key: "closed",
      header: "Closed",
      render: (row) => (
        <span className="font-body text-sm text-on-surface-variant">
          {row.closedAt !== undefined ? formatMoment(row.closedAt) : ""}
          {row.closedByName ? ` by ${row.closedByName}` : ""}
        </span>
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      align: "right",
      render: (row) => <span className="font-mono text-sm">{row.attemptCount}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <Heading as="h1" size="xl">
          Follow ups
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          Every first timer gets one. Call or message them, then record how it went.
        </p>
      </div>

      <FilterBar>
        <SegmentedFilter
          ariaLabel="Follow up status"
          value={tab}
          onChange={(value) => setTab(value as "open" | "done")}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Done" },
          ]}
        />
        {tab === "open" && (
          <FilterChip selected={mine} onClick={() => setMine((value) => !value)}>
            Mine
          </FilterChip>
        )}
      </FilterBar>

      <ResponsiveTable<Row>
        columns={tab === "open" ? openColumns : doneColumns}
        rows={rows}
        rowKey={(row) => row._id}
        skeletonRows={6}
        card={(row) => (
          <RowCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {nameCell(row)}
                <p className="font-body text-xs text-on-surface-variant">
                  First visit <span className="font-mono">{formatDateKey(row.firstVisitDate)}</span> ·{" "}
                  <span className="font-mono">{row.attemptCount}</span>{" "}
                  {row.attemptCount === 1 ? "attempt" : "attempts"}
                </p>
              </div>
              {row.status === "open" ? (
                <Assignee row={row} />
              ) : (
                <Badge variant={row.outcome === "reached" ? "verified" : "neutral"}>
                  {DONE_LABELS[row.outcome ?? "closed"]}
                </Badge>
              )}
            </div>
            {row.status === "open" && <div className="mt-3">{actions(row)}</div>}
          </RowCard>
        )}
        empty={
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
            title={tab === "open" ? (mine ? "Nothing assigned to you" : "No open follow ups") : "Nothing done yet"}
            message={
              tab === "open"
                ? "A follow up opens when a first timer is recorded."
                : "Follow ups move here once someone records how they went."
            }
          />
        }
      />

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
            Show more
          </Button>
        </div>
      )}

      {active && (
        <>
          <Dialog open={mode === "contact"} onOpenChange={(next) => !next && closeAll()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Contact {active.visitor.displayName}</DialogTitle>
                <DialogDescription>
                  Opens on your own phone. Come back here to record how it went.
                </DialogDescription>
              </DialogHeader>
              <ContactActions
                target={targetOf(active)}
                onTapped={(tapped) => {
                  setChannel(tapped);
                  setMode("log");
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setChannel(undefined);
                  setMode("log");
                }}
              >
                Record a contact
              </Button>
            </DialogContent>
          </Dialog>
          <LogContactDialog
            open={mode === "log"}
            onOpenChange={(next) => !next && closeAll()}
            target={targetOf(active)}
            followUpId={active._id}
            initialChannel={channel}
          />
          <AssignFollowUpDialog
            open={mode === "assign"}
            onOpenChange={(next) => !next && closeAll()}
            followUpId={active._id}
            visitorName={active.visitor.displayName}
            currentAssignee={active.assignedTo}
          />
          <CloseFollowUpDialog
            open={mode === "close"}
            onOpenChange={(next) => !next && closeAll()}
            followUpId={active._id}
            visitorName={active.visitor.displayName}
          />
        </>
      )}
    </div>
  );
}
