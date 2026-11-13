"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, HandHeart, Plus } from "lucide-react";
import {
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  changeAgainst,
  formatVisitDay,
  parseDashboardPeriod,
  type DashboardPeriod,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { StatCard } from "@/components/ui/StatCard";
import { StatGridSkeleton } from "@/components/ui/Skeletons";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { AddWalkInDialog } from "./AddWalkInDialog";
import {
  ClanBalancePanel,
  FollowUpHealthPanel,
  NeedsAttentionPanel,
  TeamLoadPanel,
} from "./HospitalityActTodayPanels";
import {
  AttendanceTrendPanel,
  ContactOutcomesPanel,
  VisitorJourneyPanel,
  VisitorMixPanel,
} from "./HospitalityTrendPanels";
import { RetryBoundary } from "./RetryBoundary";
import { useKampalaToday } from "./useKampalaToday";

/**
 * Hospitality's own Dashboard (spec 0025), in place of the shared department
 * one. It is about visitors, not roster upkeep: what to act on today first,
 * then the trends that guide decisions.
 *
 * Every operator (the HOD, a delegate, a verified roster member, a System
 * Admin) sees the same content; nothing here is gated beyond
 * `manageHospitality`, which every query re-checks (AC-2). None of the
 * shared Dashboard's team items appear (AC-3): they stay on Roster and
 * Activities.
 *
 * The period lives in the address as `?period=` (AC-5), so a reload or a
 * shared link keeps it. `today` is the browser's Kampala day, moved forward
 * at midnight while the tab stays open (AC-6).
 *
 * Each panel group has its own query and its own `RetryBoundary` (AC-18).
 * The overview also decides the welcome panel (AC-17), so its fallback keeps
 * the other groups on screen when it fails.
 */
export function HospitalityDashboard({
  departmentName,
  basePath,
}: {
  departmentName: string;
  /** The portal this Dashboard sits in, e.g. `/areas-of-service/hospitality`. */
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = parseDashboardPeriod(params.get("period"));
  const today = useKampalaToday();

  const setPeriod = (next: string) => {
    const query = new URLSearchParams(params.toString());
    query.set("period", next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  // Every panel in its own boundary, so a failed overview (or any one panel)
  // never hides the rest (AC-18). Order per the spec's UI section.
  const panelProps = { today, period, basePath };
  const boxed = (node: (retry: () => void) => ReactNode) => (
    <RetryBoundary>{node}</RetryBoundary>
  );
  const panels: ReactNode = (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {boxed((retry) => <NeedsAttentionPanel {...panelProps} retry={retry} />)}
        {boxed((retry) => <FollowUpHealthPanel {...panelProps} retry={retry} />)}
      </div>
      {boxed((retry) => <AttendanceTrendPanel {...panelProps} retry={retry} />)}
      {boxed((retry) => <VisitorJourneyPanel {...panelProps} retry={retry} />)}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {boxed((retry) => <ContactOutcomesPanel {...panelProps} retry={retry} />)}
        {boxed((retry) => <TeamLoadPanel {...panelProps} retry={retry} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {boxed((retry) => <VisitorMixPanel {...panelProps} retry={retry} />)}
        {boxed((retry) => <ClanBalancePanel basePath={basePath} retry={retry} />)}
      </div>
    </>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Heading as="h1" size="xl">
            {departmentName}
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Who needs you today, and whether the welcome is getting better.
          </p>
        </div>
        <SegmentedFilter
          ariaLabel="Period"
          size="sm"
          value={period}
          onChange={setPeriod}
          options={DASHBOARD_PERIODS.map((value) => ({
            value,
            label: DASHBOARD_PERIOD_LABELS[value],
          }))}
        />
      </header>

      <RetryBoundary
        fallback={(retry) => (
          <div className="space-y-8">
            <ErrorState retry={retry} />
            {panels}
          </div>
        )}
      >
        {(retry) => (
          <Overview
            today={today}
            period={period}
            basePath={basePath}
            retry={retry}
            panels={panels}
          />
        )}
      </RetryBoundary>
    </div>
  );
}

function Overview({
  today,
  period,
  basePath,
  retry,
  panels,
}: {
  today: string;
  period: DashboardPeriod;
  basePath: string;
  retry: () => void;
  panels: ReactNode;
}) {
  const overview = useAuthQuery(api.hospitality.getDashboardOverview, { today, period });

  if (overview === undefined) return <StatGridSkeleton count={4} />;
  // Access lost mid session (AC-18).
  if (overview === null) return <ErrorState retry={retry} />;
  if (!overview.hasAnyVisit) return <WelcomePanel basePath={basePath} />;

  const { current, previous } = overview.headline;
  const span = DASHBOARD_PERIOD_LABELS[period];
  const range = `${formatVisitDay(overview.window.from)} to ${formatVisitDay(overview.window.to)}`;

  return (
    <div className="space-y-8">
      <section aria-labelledby="hospitality-headline" className="space-y-3">
        <h2 id="hospitality-headline" className="sr-only">
          The last {span}
        </h2>
        <p className="font-body text-xs text-outline">
          {range}, compared with the {span} before
        </p>
        {/* Visits exist, just none in this period: say so plainly (AC-18). */}
        {current.visitors === 0 && (
          <p role="status" className="font-body text-sm text-on-surface-variant">
            No visits were recorded in the last {span}. Try a longer period.
          </p>
        )}
        <Reveal as="div" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Visitors"
            value={<CountUp value={current.visitors} />}
            hint={
              <Change
                value={changeAgainst(current.visitors, previous.visitors)}
                unit="%"
                span={span}
                fallback="Different people with a visit"
              />
            }
          />
          <StatCard
            label="First timers"
            value={<CountUp value={current.firstTimers} />}
            hint={
              <Change
                value={changeAgainst(current.firstTimers, previous.firstTimers)}
                unit="%"
                span={span}
                fallback={
                  current.firstTimers === 0 ? "No first visits yet" : "First visit in this period"
                }
              />
            }
          />
          <StatCard
            label="Came back"
            value={current.cameBackPercent === null ? "Not yet" : `${current.cameBackPercent}%`}
            hint={
              <Change
                value={changeAgainst(current.cameBackPercent, previous.cameBackPercent, "points")}
                unit=" pts"
                span={span}
                fallback={
                  current.cameBackPercent === null
                    ? "No first timers to measure yet"
                    : "Of first timers, visited again"
                }
              />
            }
          />
          <StatCard
            label="Contacted on time"
            value={current.onTime.percent === null ? "Not yet" : `${current.onTime.percent}%`}
            hint={
              <span className="block space-y-1">
                <Change
                  value={changeAgainst(current.onTime.percent, previous.onTime.percent, "points")}
                  unit=" pts"
                  span={span}
                  fallback={
                    current.onTime.eligible === 0
                      ? "Nobody is past their 2 days yet"
                      : "Called, messaged or met within 2 days"
                  }
                />
                {current.onTime.medianDays !== null && (
                  <span className="block">
                    Typically{" "}
                    <span className="font-mono">{formatDays(current.onTime.medianDays)}</span> to a
                    first contact
                  </span>
                )}
              </span>
            }
          />
        </Reveal>
      </section>
      {panels}
    </div>
  );
}

/** "same day", "1 day", "2.5 days". */
function formatDays(days: number): string {
  if (days === 0) return "same day";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The change against the previous window, as an up or down figure (AC-7).
 * The arrow and the word both say the direction, so colour never carries it
 * alone (AC-19). No figure when there was nothing to compare with.
 */
function Change({
  value,
  unit,
  span,
  fallback,
}: {
  value: number | null;
  unit: string;
  span: string;
  fallback: string;
}) {
  if (value === null) return <span>{fallback}</span>;
  if (value === 0) {
    return (
      <span>
        Same as the {span} before
      </span>
    );
  }
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-brand" : "text-crimson")}>
      <Icon className="h-3 w-3" aria-hidden />
      <span>
        {up ? "Up" : "Down"}{" "}
        <span className="font-mono">
          {Math.abs(value)}
          {unit}
        </span>{" "}
        on the {span} before
      </span>
    </span>
  );
}

/** Until Hospitality has recorded any visit at all (AC-17). */
function WelcomePanel({ basePath }: { basePath: string }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="rounded-md bg-surface-lowest shadow-e1">
      <EmptyState
        icon={<HandHeart className="h-5 w-5" aria-hidden />}
        title="Your Dashboard fills in as visitors arrive"
        message="Once the first visit is recorded, you will see who is waiting for a follow up, how quickly first timers are contacted, and who keeps coming back."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add a walk in
            </Button>
            <Link
              href={`${basePath}/visitors`}
              className="font-body text-sm font-medium text-primary hover:underline"
            >
              Go to Visitors
            </Link>
          </div>
        }
      />
      <AddWalkInDialog open={adding} onOpenChange={setAdding} />
    </section>
  );
}
