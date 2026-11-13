"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BarChart3, MessagesSquare, Route, UsersRound } from "lucide-react";
import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_OUTCOME_LABELS,
  INVITED_SOURCE_LABELS,
  NOT_RECORDED_LABEL,
  PERSONAL_CONTACT_CHANNELS,
  VISITOR_AGE_BRACKET_LABELS,
  VISITOR_JOURNEY_STEP_LABELS,
  VISITOR_KIND_LABELS,
  VISITOR_SEX_LABELS,
  percentOf,
  type AgeBracket,
  type DashboardPeriod,
  type PersonalContactChannel,
  type Sex,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardSkeleton } from "@/components/ui/Skeletons";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { Panel } from "./HospitalityActTodayPanels";
import { binLabel } from "./HospitalityReportView";
import { formatDateKey } from "./hospitalityErrors";

/**
 * The trend panels of the Hospitality Dashboard (spec 0025, AC-11 to AC-14).
 * All of them read the period. Each sits in its own boundary (in
 * `HospitalityDashboard`), so one failing never takes the others down
 * (AC-18). Every chart has its numbers in text or a table beside it, and
 * colour never carries meaning alone (AC-19).
 */

// Recharts loads only when the trend is on screen (the portal's convention).
const TrendChart = dynamic(
  () => import("./ReportChartBody").then((m) => m.ReportChartBody),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

type PanelProps = { today: string; period: DashboardPeriod; basePath: string; retry: () => void };

/** Loading and lost access, the same for every panel (AC-18). */
function PanelState({ retry, loading }: { retry: () => void; loading: boolean }) {
  return loading ? <CardSkeleton className="h-48" /> : <ErrorState retry={retry} />;
}

/** True under `prefers-reduced-motion`, so the chart draws without animating (AC-19). */
function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}

/** A labelled horizontal bar with its count (and share) in text, never colour alone. */
function CountBar({
  label,
  count,
  of,
  share,
  tone = "primary",
}: {
  label: string;
  count: number;
  /** The bar's full width. */
  of: number;
  /** Also say the share of `of`, e.g. "4 (40%)". */
  share?: boolean;
  tone?: "primary" | "royal";
}) {
  const percent = percentOf(count, of);
  return (
    <li className="flex items-center gap-3">
      <span className="w-28 shrink-0 font-body text-sm text-on-surface sm:w-40">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-low" aria-hidden>
        <span
          className={cn("block h-full rounded-full", tone === "royal" ? "bg-royal" : "bg-primary")}
          style={{ width: `${of > 0 ? (count / of) * 100 : 0}%` }}
        />
      </span>
      <span className="w-20 shrink-0 text-right font-body text-sm text-on-surface">
        <span className="font-mono">{count}</span>
        {share && percent !== null && (
          <span className="ml-1 font-mono text-xs text-on-surface-variant">{percent}%</span>
        )}
      </span>
    </li>
  );
}

// -- Attendance trend (AC-11) ------------------------------------------------

export function AttendanceTrendPanel({ today, period, basePath, retry }: PanelProps) {
  // The same subscription the headline numbers use, so this costs nothing extra.
  const overview = useAuthQuery(api.hospitality.getDashboardOverview, { today, period });
  const reducedMotion = usePrefersReducedMotion();
  if (!overview) return <PanelState retry={retry} loading={overview === undefined} />;

  const { weekly, bins } = overview.trend;
  const unit = weekly ? "week" : "month";
  const label = (bin: (typeof bins)[number]) =>
    `${binLabel(bin.key, weekly)}${bin.soFar ? " (so far)" : ""}`;
  const chart = bins.map((bin) => ({
    label: label(bin),
    full: `${weekly ? "Week of " : ""}${formatDateKey(bin.start)} to ${formatDateKey(bin.end)}${
      bin.soFar ? ", so far" : ""
    }`,
    firstTimers: bin.firstTimers,
    returning: bin.returning,
  }));
  const anyVisits = bins.some((bin) => bin.visitors > 0);
  const reportsHref = `${basePath}/reports?from=${overview.window.from}&to=${overview.window.to}`;

  return (
    <Panel
      id="hospitality-trend"
      title="Attendance trend"
      description={`Different visitors each ${unit}, first timers on top of returning visitors.`}
      action={
        <Link href={reportsHref} className="font-body text-sm font-medium text-primary hover:underline">
          Open in Reports
        </Link>
      }
    >
      {anyVisits ? (
        <div className="space-y-4">
          <div className="h-64 w-full">
            <TrendChart data={chart} animate={!reducedMotion} />
          </div>
          {/* The numbers behind the chart, readable without it (AC-19). */}
          <Table className="shadow-none" caption={`Visitors per ${unit}`}>
            <THead>
              <TR>
                <TH>{weekly ? "Week of" : "Month"}</TH>
                <TH align="right">Visitors</TH>
                <TH align="right">First timers</TH>
                <TH align="right">Returning</TH>
              </TR>
            </THead>
            <TBody>
              {bins.map((bin) => (
                <TR key={bin.key}>
                  <TD>
                    <span className="font-body text-sm text-on-surface">{label(bin)}</span>
                  </TD>
                  <TD align="right">
                    <span className="font-mono text-sm">{bin.visitors}</span>
                  </TD>
                  <TD align="right">
                    <span className="font-mono text-sm">{bin.firstTimers}</span>
                  </TD>
                  <TD align="right">
                    <span className="font-mono text-sm">{bin.returning}</span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          className="py-6"
          icon={<BarChart3 className="h-5 w-5" aria-hidden />}
          title="No visits in this period"
          message="Visits recorded in the period appear here."
        />
      )}
    </Panel>
  );
}

// -- Visitor journey (AC-12) -------------------------------------------------

function useJourney(today: string, period: DashboardPeriod) {
  return useAuthQuery(api.hospitality.getVisitorJourney, { today, period });
}

export function VisitorJourneyPanel({ today, period, retry }: PanelProps) {
  const journey = useJourney(today, period);
  if (!journey) return <PanelState retry={retry} loading={journey === undefined} />;

  return (
    <Panel
      id="hospitality-journey"
      title="Visitor journey"
      description="Of this period's first timers, how many reached each step. Each step stands on its own."
    >
      {journey.cohortSize === 0 ? (
        <EmptyState
          className="py-6"
          icon={<Route className="h-5 w-5" aria-hidden />}
          title="No first timers in this period"
          message="First visits recorded in the period appear here."
        />
      ) : (
        <ul className="space-y-3">
          {journey.steps.map((step) => (
            <CountBar
              key={step.key}
              label={VISITOR_JOURNEY_STEP_LABELS[step.key]}
              count={step.count}
              of={journey.cohortSize}
              share
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- Visitor mix (AC-14) -----------------------------------------------------

const ageLabel = (key: AgeBracket | "none") =>
  key === "none" ? NOT_RECORDED_LABEL : VISITOR_AGE_BRACKET_LABELS[key];
const sexLabel = (key: Sex | "none") => (key === "none" ? NOT_RECORDED_LABEL : VISITOR_SEX_LABELS[key]);

export function VisitorMixPanel({ today, period, retry }: PanelProps) {
  const journey = useJourney(today, period);
  if (!journey) return <PanelState retry={retry} loading={journey === undefined} />;

  const { mix, cohortSize } = journey;
  const groups = [
    { title: "Age group", rows: mix.age.map((row) => ({ ...row, label: ageLabel(row.key) })) },
    { title: "Sex", rows: mix.sex.map((row) => ({ ...row, label: sexLabel(row.key) })) },
    {
      title: "Came through",
      rows: mix.source.map((row) => ({ ...row, label: VISITOR_KIND_LABELS[row.key] })),
    },
    {
      title: "Invited",
      rows: mix.invited.map((row) => ({ ...row, label: INVITED_SOURCE_LABELS[row.key] })),
    },
  ];

  return (
    <Panel
      id="hospitality-mix"
      title="Visitor mix"
      description="Who this period's first timers are."
    >
      {cohortSize === 0 ? (
        <EmptyState
          className="py-6"
          icon={<UsersRound className="h-5 w-5" aria-hidden />}
          title="No first timers in this period"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title} className="min-w-0 space-y-2">
              <h3 className="font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.rows.map((row) => (
                  <CountBar
                    key={row.key}
                    label={row.label}
                    count={row.count}
                    of={cohortSize}
                    share
                    tone="royal"
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// -- Contact outcomes (AC-13) ------------------------------------------------

/** One brand tone per channel; the legend and table name them too (AC-19). */
const CHANNEL_TONE: Record<PersonalContactChannel, string> = {
  call: "bg-primary",
  whatsapp: "bg-royal",
  sms: "bg-crimson",
  in_person: "bg-gold-deep",
};

export function ContactOutcomesPanel({ today, period, retry }: PanelProps) {
  const outcomes = useAuthQuery(api.hospitality.getContactOutcomes, { today, period });
  if (!outcomes) return <PanelState retry={retry} loading={outcomes === undefined} />;

  const totalOf = (byChannel: Record<PersonalContactChannel, number>) =>
    PERSONAL_CONTACT_CHANNELS.reduce((sum, channel) => sum + byChannel[channel], 0);
  const largest = Math.max(1, ...outcomes.byOutcome.map((row) => totalOf(row.byChannel)));
  const anyContacts = outcomes.reachRate.some((row) => row.total > 0);

  return (
    <Panel
      id="hospitality-outcomes"
      title="Contact outcomes"
      description="Calls, WhatsApp, SMS and visits in person in this period. In app messages are not counted."
    >
      {!anyContacts ? (
        <EmptyState
          className="py-6"
          icon={<MessagesSquare className="h-5 w-5" aria-hidden />}
          title="No contacts logged in this period"
          message="Contacts logged on a follow up appear here."
        />
      ) : (
        <div className="space-y-5">
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Channels">
            {PERSONAL_CONTACT_CHANNELS.map((channel) => (
              <li key={channel} className="flex items-center gap-1.5 font-body text-xs text-on-surface-variant">
                <span className={cn("size-2 rounded-full", CHANNEL_TONE[channel])} aria-hidden />
                {CONTACT_CHANNEL_LABELS[channel]}
              </li>
            ))}
          </ul>
          <ul className="space-y-3">
            {outcomes.byOutcome.map((row) => {
              const total = totalOf(row.byChannel);
              return (
                <li key={row.outcome} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 font-body text-sm text-on-surface sm:w-40">
                    {CONTACT_OUTCOME_LABELS[row.outcome]}
                  </span>
                  <span
                    className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-low"
                    aria-hidden
                  >
                    {PERSONAL_CONTACT_CHANNELS.map((channel) => (
                      <span
                        key={channel}
                        className={cn("block h-full", CHANNEL_TONE[channel])}
                        style={{ width: `${(row.byChannel[channel] / largest) * 100}%` }}
                      />
                    ))}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-sm text-on-surface">
                    {total}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Every number behind the bars, plus the reach rate per channel. */}
          <Table className="shadow-none" caption="Contacts by outcome and channel, with the reach rate">
            <THead>
              <TR>
                <TH>Outcome</TH>
                {PERSONAL_CONTACT_CHANNELS.map((channel) => (
                  <TH key={channel} align="right">
                    {CONTACT_CHANNEL_LABELS[channel]}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {outcomes.byOutcome.map((row) => (
                <TR key={row.outcome}>
                  <TD>
                    <span className="font-body text-sm text-on-surface">
                      {CONTACT_OUTCOME_LABELS[row.outcome]}
                    </span>
                  </TD>
                  {PERSONAL_CONTACT_CHANNELS.map((channel) => (
                    <TD key={channel} align="right">
                      <span className="font-mono text-sm">{row.byChannel[channel]}</span>
                    </TD>
                  ))}
                </TR>
              ))}
              <TR>
                <TD>
                  <span className="font-body text-sm font-semibold text-on-surface">Reach rate</span>
                </TD>
                {outcomes.reachRate.map((rate) => {
                  const percent = percentOf(rate.reached, rate.total);
                  return (
                    <TD key={rate.channel} align="right">
                      <span className="font-mono text-sm font-semibold">
                        {percent === null ? "None" : `${percent}%`}
                      </span>
                      <span className="sr-only">
                        , {rate.reached} reached of {rate.total}
                      </span>
                    </TD>
                  );
                })}
              </TR>
            </TBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
