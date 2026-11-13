"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { CHURCH_NAME, isValidReportRange } from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { HospitalityReportView, type HospitalityReportData } from "./HospitalityReportView";
import { formatDateKey, formatMoment } from "./hospitalityErrors";

/**
 * While this page is open, printing shows only the print root: the portal's
 * sidebar and top bar are hidden for the printout, without touching the
 * shared layout or the global stylesheet. Mounted and removed with the page.
 */
const PRINT_CSS = `
@media print {
  body > *:not([data-hospitality-print]) { display: none !important; }
  [data-hospitality-print] { display: block !important; }
  @page { margin: 16mm; }
}
`;

/**
 * The report's print view (AC-37). Same range, same numbers as the Reports
 * page, with the church name, title, range and the time it was generated.
 * It opens the browser's print dialog once the numbers are in, and the
 * person saves it as a PDF there.
 */
export function ReportPrintPage() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const valid = isValidReportRange(from, to);
  const report = useAuthQuery(api.hospitality.getReport, valid ? { from, to } : "skip");
  const [generatedAt] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Print once, after the numbers and the chart have had a moment to draw.
  const [printed, setPrinted] = useState(false);
  useEffect(() => {
    if (!report || printed) return;
    const id = setTimeout(() => {
      setPrinted(true);
      window.print();
    }, 600);
    return () => clearTimeout(id);
  }, [report, printed]);

  if (!valid) {
    return (
      <p role="alert" className="font-body text-sm text-error">
        This print link has no valid range. Open Reports and choose Download PDF again.
      </p>
    );
  }
  if (report === undefined) {
    return <Skeleton className="h-96 w-full rounded-md" aria-busy="true" />;
  }
  if (report === null) return <ErrorState />;

  const sheet = <PrintSheet report={report} generatedAt={generatedAt} />;
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-sm text-on-surface-variant">
            Your browser’s print dialog saves this as a PDF.
          </p>
          <Button variant="primary" size="sm" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        </div>
        <div className="rounded-md bg-surface-lowest p-6 shadow-e1">{sheet}</div>
      </div>
      {mounted &&
        createPortal(
          <div data-hospitality-print className="hidden bg-background text-on-surface">
            {sheet}
          </div>,
          document.body,
        )}
    </>
  );
}

function PrintSheet({
  report,
  generatedAt,
}: {
  report: HospitalityReportData;
  generatedAt: number;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-body text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          {CHURCH_NAME}
        </p>
        <h1 className="font-display text-2xl font-semibold text-on-surface">
          Hospitality report
        </h1>
        <p className="font-body text-sm text-on-surface-variant">
          <span className="font-mono">{formatDateKey(report.from)}</span> to{" "}
          <span className="font-mono">{formatDateKey(report.to)}</span> · Generated{" "}
          <span className="font-mono">{formatMoment(generatedAt)}</span> (Kampala time)
        </p>
      </header>
      <HospitalityReportView report={report} print />
    </div>
  );
}
