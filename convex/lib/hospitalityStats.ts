import type { ReportBin } from "@klt-cyber/shared";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Visitor counting shared by Reports (spec 0024, AC-36) and the Hospitality
 * Dashboard (spec 0025, AC-11), so the two never disagree on a bin.
 */

export interface ReportBinRow {
  key: string;
  start: string;
  end: string;
  visitors: number;
  firstTimers: number;
  returning: number;
}

/**
 * Distinct visitors per bin, split into first timers (their `firstVisitDate`
 * is inside the bin) and returning visitors (it is before the bin). A visitor
 * whose row is gone or carries no first visit counts in `visitors` only.
 */
export function binVisitors(
  bins: readonly ReportBin[],
  visits: readonly Doc<"visitorVisits">[],
  visitorsById: ReadonlyMap<Id<"visitors">, Doc<"visitors">>
): ReportBinRow[] {
  return bins.map((bin) => {
    const inBin = new Set(
      visits
        .filter((visit) => visit.visitDate >= bin.start && visit.visitDate <= bin.end)
        .map((visit) => visit.visitorId)
    );
    let firstTimers = 0;
    let returning = 0;
    for (const id of inBin) {
      const first = visitorsById.get(id)?.firstVisitDate;
      if (!first) continue;
      if (first < bin.start) returning += 1;
      else if (first <= bin.end) firstTimers += 1;
    }
    return { ...bin, visitors: inBin.size, firstTimers, returning };
  });
}
