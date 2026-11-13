"use client";

import dynamic from "next/dynamic";
import type { FunctionReturnType } from "convex/server";
import { CONTACT_CHANNEL_LABELS, type ContactChannel } from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Heading } from "@/components/ui/Heading";
import { StatCard } from "@/components/ui/StatCard";
import { formatDateKey } from "./hospitalityErrors";

export type HospitalityReportData = NonNullable<
  FunctionReturnType<typeof api.hospitality.getReport>
>;

// Recharts loads only when a report is on screen (the portal's convention).
const ChartBody = dynamic(
  () => import("./ReportChartBody").then((m) => m.ReportChartBody),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

const CHANNEL_ORDER: ContactChannel[] = ["call", "whatsapp", "sms", "in_person", "in_app"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "8 Nov" for a week, "Nov 2026" for a month. */
export function binLabel(key: string, weekly: boolean): string {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return weekly ? `${day} ${MONTHS[month - 1]}` : `${MONTHS[month - 1]} ${year}`;
}

/**
 * The report's numbers (AC-36), shared by the Reports page and its print
 * view so the PDF says exactly what the screen says.
 */
export function HospitalityReportView({
  report,
  print = false,
}: {
  report: HospitalityReportData;
  print?: boolean;
}) {
  const chart = report.bins.map((bin) => ({
    label: binLabel(bin.key, report.weekly),
    full: `${report.weekly ? "Week of" : ""} ${formatDateKey(bin.start)} to ${formatDateKey(bin.end)}`.trim(),
    firstTimers: bin.firstTimers,
    returning: bin.returning,
  }));
  const anyVisits = report.visitorsInRange > 0;
  const card = print ? "break-inside-avoid shadow-none" : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard className={card} label="Visitors in range" value={report.visitorsInRange} hint="Different people with a visit" />
        <StatCard
          className={card}
          label="Regulars"
          value={report.regulars}
          hint="Three visits in some month of the range"
        />
        <StatCard
          className={card}
          label="Follow ups opened"
          value={report.followUps.opened}
          hint={`${report.followUps.done} of them done`}
        />
        <StatCard
          className={card}
          label="Follow ups done"
          value={`${report.followUps.percentDone}%`}
          hint="Of the follow ups opened in the range"
        />
      </div>

      <section className="break-inside-avoid rounded-md border border-border bg-surface-lowest p-5 shadow-e1 print:shadow-none">
        <Heading as="h2" size="lg">
          Visitors {report.weekly ? "per week" : "per month"}
        </Heading>
        <p className="mb-3 mt-1 font-body text-sm text-on-surface-variant">
          First timers made their first ever visit in that {report.weekly ? "week" : "month"}.
        </p>
        {anyVisits ? (
          <div className="h-64 w-full">
            <ChartBody data={chart} animate={!print} />
          </div>
        ) : (
          <p className="font-body text-sm text-on-surface-variant">
            No visits were recorded in this range.
          </p>
        )}
        {/* The numbers behind the chart, readable without it. */}
        {anyVisits && (
          <div className="mt-4">
            <table className="w-full font-body text-sm">
              <caption className="sr-only">Visitors per {report.weekly ? "week" : "month"}</caption>
              <thead>
                <tr className="text-left text-xs text-on-surface-variant">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {report.weekly ? "Week of" : "Month"}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Visitors</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">First timers</th>
                  <th scope="col" className="py-1 text-right font-medium">Returning</th>
                </tr>
              </thead>
              <tbody>
                {report.bins.map((bin) => (
                  <tr key={bin.key} className="even:bg-surface-low">
                    <td className="py-1 pr-3 text-on-surface">{binLabel(bin.key, report.weekly)}</td>
                    <td className="py-1 pr-3 text-right font-mono">{bin.visitors}</td>
                    <td className="py-1 pr-3 text-right font-mono">{bin.firstTimers}</td>
                    <td className="py-1 text-right font-mono">{bin.returning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="break-inside-avoid rounded-md border border-border bg-surface-lowest p-5 shadow-e1 print:shadow-none">
        <Heading as="h2" size="lg">
          Contacts by channel
        </Heading>
        <p className="mb-3 mt-1 font-body text-sm text-on-surface-variant">
          Calls, WhatsApp and SMS are logged by the team from their own phones.
        </p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CHANNEL_ORDER.map((channel) => (
            <li key={channel} className="rounded-md bg-surface-low p-3">
              <p className="font-body text-xs text-on-surface-variant">{CONTACT_CHANNEL_LABELS[channel]}</p>
              <p className="font-mono text-lg text-on-surface">{report.contacts[channel]}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
