"use client";

import { Component, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import {
  REPORT_MAX_RANGE_DAYS,
  defaultReportRange,
  isValidReportRange,
  kampalaToday,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Label } from "@/components/shadcn/label";
import { Skeleton } from "@/components/shadcn/skeleton";
import { DatePicker } from "@/components/ui/DatePicker";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { HospitalityReportView } from "./HospitalityReportView";
import { keyToMs, msToKey } from "./hospitalityErrors";

/** Retry remounts the report, which opens a fresh subscription. */
class RetryBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean; attempt: number; resetKey: string }
> {
  state = { failed: false, attempt: 0, resetKey: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { resetKey: string; failed: boolean },
  ) {
    // A new range is a new question: clear the old failure.
    return props.resetKey !== state.resetKey
      ? { failed: false, resetKey: props.resetKey }
      : null;
  }
  render() {
    if (this.state.failed) {
      return (
        <ErrorState
          retry={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
        />
      );
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

/**
 * Reports (spec 0024, AC-36, AC-37, H6-01, H6-02).
 *
 * A date range, the last 3 months by default and at most two years. "Download
 * PDF" opens the print view of the same range, which the browser saves as a
 * PDF. No PDF library is involved.
 */
export function ReportsPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();
  // A range in the address (the Dashboard's "Open in Reports", spec 0025
  // AC-11) wins when valid; otherwise the last 3 months.
  const [initial] = useState(() => {
    const from = search.get("from");
    const to = search.get("to");
    return from && to && isValidReportRange(from, to)
      ? { from, to }
      : defaultReportRange(kampalaToday());
  });
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const valid = isValidReportRange(from, to);
  const printHref = `/areas-of-service/${slug}/reports/print?from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Heading as="h1" size="xl">
            Reports
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Visitor trends and follow ups for the range you choose.
          </p>
        </div>
        {valid ? (
          <Link
            href={printHref}
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[image:linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] px-4 font-body text-sm font-semibold text-on-primary"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download PDF
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-md bg-surface-low p-4 sm:grid-cols-2 lg:max-w-xl">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="report-from" className="font-body text-xs text-on-surface-variant">
            From
          </Label>
          <DatePicker
            id="report-from"
            value={keyToMs(from)}
            onChange={(ms) => ms !== undefined && setFrom(msToKey(ms))}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="report-to" className="font-body text-xs text-on-surface-variant">
            To
          </Label>
          <DatePicker
            id="report-to"
            value={keyToMs(to)}
            onChange={(ms) => ms !== undefined && setTo(msToKey(ms))}
          />
        </div>
      </div>

      {valid ? (
        <RetryBoundary resetKey={`${from}|${to}`}>
          <Report from={from} to={to} />
        </RetryBoundary>
      ) : (
        <p role="alert" className="font-body text-sm text-error">
          Choose a start on or before the end, and a range of at most{" "}
          <span className="font-mono">{REPORT_MAX_RANGE_DAYS}</span> days.
        </p>
      )}
    </div>
  );
}

function Report({ from, to }: { from: string; to: string }) {
  const report = useAuthQuery(api.hospitality.getReport, { from, to });
  if (report === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-72 w-full rounded-md" />
      </div>
    );
  }
  if (report === null) return <ErrorState />;
  return <HospitalityReportView report={report} />;
}
