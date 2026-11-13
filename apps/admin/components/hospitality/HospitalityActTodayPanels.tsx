"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, Network, UsersRound } from "lucide-react";
import {
  DASHBOARD_PERIOD_LABELS,
  FOLLOW_UP_AGE_BUCKETS,
  FOLLOW_UP_AGE_BUCKET_LABELS,
  FOLLOW_UP_OVERDUE_DAYS,
  type DashboardPeriod,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/shadcn/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { CardSkeleton } from "@/components/ui/Skeletons";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";

/**
 * The "act today" panels of the Hospitality Dashboard (spec 0025, AC-9,
 * AC-15, AC-16). They always show the present; only team load's "done"
 * column reads the period.
 *
 * Follow up health, needs attention and team load share one query
 * (`getFollowUpHealth`); Convex hands every caller with the same arguments
 * the same subscription, so mounting it three times costs one. Each panel
 * still sits in its own boundary (in `HospitalityDashboard`), so one failing
 * never takes the others down (AC-18).
 */

/** A lifted parchment card with a heading, the Dashboard's panel shape. */
export function Panel({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 rounded-md border border-border bg-surface-lowest p-6 shadow-e1"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Heading as="h2" size="lg" id={id}>
            {title}
          </Heading>
          {description && (
            <p className="mt-1 font-body text-sm text-on-surface-variant">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Loading and lost access, the same for every panel (AC-18). */
function PanelState({ retry, loading }: { retry: () => void; loading: boolean }) {
  return loading ? <CardSkeleton className="h-48" /> : <ErrorState retry={retry} />;
}

type PanelProps = { today: string; period: DashboardPeriod; basePath: string; retry: () => void };

function useHealth(today: string, period: DashboardPeriod) {
  return useAuthQuery(api.hospitality.getFollowUpHealth, { today, period });
}

// -- Needs attention (AC-9) --------------------------------------------------

export function NeedsAttentionPanel({ today, period, basePath, retry }: PanelProps) {
  const health = useHealth(today, period);
  if (!health) return <PanelState retry={retry} loading={health === undefined} />;

  return (
    <Panel
      id="hospitality-attention"
      title="Needs attention"
      description={`Nobody has them yet, or they have waited ${FOLLOW_UP_OVERDUE_DAYS} days or more.`}
    >
      {health.attention.length === 0 ? (
        <EmptyState
          className="py-6"
          icon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
          title="Nobody is waiting too long"
          message="Every first timer has someone, and nobody is overdue."
        />
      ) : (
        <ul className="divide-y divide-surface-low">
          {health.attention.map((row) => (
            <li key={row.followUpId}>
              <Link
                href={`${basePath}/visitors/${row.visitorId}`}
                className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-low"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-semibold text-on-surface">
                    {row.name}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    {row.assignee ?? "Unassigned"}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 font-body text-xs",
                    row.daysWaiting >= FOLLOW_UP_OVERDUE_DAYS ? "font-semibold text-crimson" : "text-on-surface-variant",
                  )}
                >
                  <span className="font-mono">{row.daysWaiting}</span>{" "}
                  {row.daysWaiting === 1 ? "day" : "days"} waiting
                </p>
                <ChevronRight className="h-4 w-4 shrink-0 text-outline" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- Follow up health (AC-9) -------------------------------------------------

export function FollowUpHealthPanel({ today, period, basePath, retry }: PanelProps) {
  const health = useHealth(today, period);
  if (!health) return <PanelState retry={retry} loading={health === undefined} />;

  const total = health.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const href = `${basePath}/follow-ups`;

  return (
    <Panel
      id="hospitality-health"
      title="Follow up health"
      description="Open follow ups, by days since the first visit."
      action={
        <Link href={href} className="font-body text-sm font-medium text-primary hover:underline">
          Follow ups
        </Link>
      }
    >
      {total === 0 ? (
        <EmptyState
          className="py-6"
          icon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
          title="No open follow ups"
          message="Every first timer has been followed up."
        />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2">
            {health.buckets.map((bucket) => {
              const overdue = bucket.key === FOLLOW_UP_AGE_BUCKETS.at(-1);
              return (
                <li key={bucket.key}>
                  <Link
                    href={href}
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-low"
                  >
                    <span className="w-28 shrink-0 font-body text-sm text-on-surface">
                      {FOLLOW_UP_AGE_BUCKET_LABELS[bucket.key]}
                    </span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-low">
                      <span
                        className={cn("block h-full rounded-full", overdue ? "bg-crimson" : "bg-primary")}
                        style={{ width: `${(bucket.count / total) * 100}%` }}
                      />
                    </span>
                    <span
                      className={cn(
                        "w-20 shrink-0 text-right font-body text-sm",
                        overdue && bucket.count > 0 ? "font-semibold text-crimson" : "text-on-surface",
                      )}
                    >
                      <span className="font-mono">{bucket.count}</span>
                      {overdue && bucket.count > 0 && " overdue"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="font-body text-sm text-on-surface-variant">
            <span className="font-mono font-semibold text-on-surface">{health.unassigned}</span> of{" "}
            <span className="font-mono">{total}</span> not given to anyone yet
          </p>
        </div>
      )}
    </Panel>
  );
}

// -- Team load (AC-15) ---------------------------------------------------------

export function TeamLoadPanel({ today, period, retry }: PanelProps) {
  const health = useHealth(today, period);
  if (!health) return <PanelState retry={retry} loading={health === undefined} />;

  const { unassignedOpen, rows } = health.teamLoad;
  const span = DASHBOARD_PERIOD_LABELS[period];

  return (
    <Panel
      id="hospitality-team-load"
      title="Team load"
      description={`Who has follow ups now, and who closed them in the last ${span}.`}
    >
      {rows.length === 0 && unassignedOpen === 0 ? (
        <EmptyState
          className="py-6"
          icon={<UsersRound className="h-5 w-5" aria-hidden />}
          title="No follow ups to share out yet"
          message="Assigned and closed follow ups appear here."
        />
      ) : (
        <Table className="shadow-none">
          <THead>
            <TR>
              <TH>Person</TH>
              <TH align="right">Open now</TH>
              <TH align="right">Done</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>
                <span className="font-body text-sm font-semibold text-on-surface">Unassigned</span>
              </TD>
              <TD align="right">
                <span className={cn("font-mono text-sm", unassignedOpen > 0 && "font-semibold text-crimson")}>
                  {unassignedOpen}
                </span>
              </TD>
              <TD align="right">
                <span className="sr-only">Not counted</span>
              </TD>
            </TR>
            {rows.map((row) => (
              <TR key={row.userId}>
                <TD>
                  <span className="flex flex-wrap items-center gap-2 font-body text-sm text-on-surface">
                    {row.name}
                    {row.formerOperator && <Badge>former operator</Badge>}
                  </span>
                </TD>
                <TD align="right">
                  <span className="font-mono text-sm">{row.open}</span>
                </TD>
                <TD align="right">
                  <span className="font-mono text-sm">{row.doneInPeriod}</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

// -- Clan balance (AC-16) ------------------------------------------------------

export function ClanBalancePanel({ basePath, retry }: Pick<PanelProps, "basePath" | "retry">) {
  const balance = useAuthQuery(api.hospitality.getClanBalance, {});
  if (!balance) return <PanelState retry={retry} loading={balance === undefined} />;

  const largest = Math.max(1, ...balance.clans.map((clan) => clan.verifiedCount));
  const placement = `${basePath}/clan-placement`;

  return (
    <Panel
      id="hospitality-clans"
      title="Clan balance"
      description="Verified members in each clan, smallest first."
      action={
        <Link href={placement} className="font-body text-sm font-medium text-primary hover:underline">
          Clan placement
        </Link>
      }
    >
      <div className="space-y-4">
        <p className="font-body text-sm text-on-surface-variant">
          <span
            className={cn(
              "font-mono font-semibold",
              balance.waitingForClan > 0 ? "text-crimson" : "text-on-surface",
            )}
          >
            {balance.waitingForClan}
          </span>{" "}
          {balance.waitingForClan === 1 ? "member is" : "members are"} waiting for a clan
        </p>
        {balance.clans.length === 0 ? (
          <EmptyState
            className="py-6"
            icon={<Network className="h-5 w-5" aria-hidden />}
            title="No clans are set up yet"
          />
        ) : (
          <ul className="space-y-2">
            {balance.clans.map((clan) => (
              <li key={clan.clanId} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate font-body text-sm text-on-surface">
                  {clan.name}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-low">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      clan.highlighted ? "bg-primary" : "bg-royal",
                    )}
                    style={{ width: `${(clan.verifiedCount / largest) * 100}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right font-body text-sm text-on-surface">
                  <span className="font-mono">{clan.verifiedCount}</span>
                  {clan.highlighted && (
                    <span className="ml-1 text-xs font-semibold text-primary">smallest</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
