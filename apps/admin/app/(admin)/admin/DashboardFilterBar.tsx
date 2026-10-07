"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Separator } from "@/components/shadcn/separator";
import { DatePicker } from "@/components/ui/DatePicker";
import { FilterChip, SegmentedFilter } from "@/components/ui/FilterBar";
import { cn } from "@/lib/utils";
import {
  AGE_BUCKETS,
  NO_DEPARTMENT_FILTER,
  type DashboardFilters,
} from "./demographicsUtils";
import { LEADERSHIP_LABEL, MARITAL_LABEL, MENTORSHIP_LABEL } from "./dimensions";

const ALL = "all";

type Ref = { _id: string; name: string };

const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female" };
const VERIFICATION_LABEL: Record<string, string> = {
  pending_verification: "Pending",
  verified: "Verified",
};

// Shared compact treatment for every Select trigger in this bar — Select
// itself defaults to a touch-sized h-11/text-base (correct for a form, too
// large for a dense toolbar that has to hold 5+ controls in one row). No
// change to the shared component: every other Select in the app (forms,
// MembersClient's own filters, etc.) keeps its default size.
const COMPACT_TRIGGER =
  "h-8 px-2.5 py-1 text-xs [&>span]:min-w-0 [&>span]:truncate";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Zone 1 — the sticky, always-visible filter bar. 5 primary filters (Clan,
 * Gender, Marital Status, Ministry, Leadership) stay in the always-visible
 * row; the other 4 (age bracket, verification status, mentorship status,
 * join-date range) live behind "More" so nothing combinable is lost — just
 * demoted to secondary. Every active filter, primary or secondary, surfaces
 * as a removable chip below the row, so nothing is hidden inside a closed
 * dropdown once it's applied.
 *
 * Cardinality drove each control's shape: Clan/Ministry (12–13+ options)
 * stay `Select`; Gender (2 options) is a `SegmentedFilter`; Marital status
 * and Leadership (4–5 options) stay `Select` — wide enough to overflow a
 * segmented control at this bar's width, but too few to want a full
 * dropdown-per-value affordance either, so their chosen value still reads
 * directly at a glance via the row below.
 *
 * Every control here runs at the compact "sm" treatment (`COMPACT_TRIGGER`,
 * `size="sm"` on FilterChip/SegmentedFilter) — this bar is persistent chrome
 * competing with the page's actual content for space, so it stays deliberately
 * small; the shared primitives' default sizes are untouched everywhere else.
 *
 * Fully controlled — no local filter state. Sticks at `top-16` to sit flush
 * under AdminTopBar's `h-16`, `z-10` to stay below its `z-20`.
 */
export function DashboardFilterBar({
  filters,
  onFilterChange,
  onClear,
  activeCount,
  clans,
  departments,
}: {
  filters: DashboardFilters;
  onFilterChange: <K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K],
  ) => void;
  onClear: () => void;
  activeCount: number;
  clans: Ref[] | undefined;
  departments: Ref[] | undefined;
}) {
  const moreCount =
    [filters.ageBracket, filters.verificationStatus, filters.mentorshipStatus].filter(
      (v) => v !== ALL,
    ).length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.clanId !== ALL) {
    chips.push({
      key: "clan",
      label: `Clan: ${clans?.find((c) => c._id === filters.clanId)?.name ?? "—"}`,
      onRemove: () => onFilterChange("clanId", ALL),
    });
  }
  if (filters.sex !== ALL) {
    chips.push({
      key: "sex",
      label: `Gender: ${SEX_LABEL[filters.sex]}`,
      onRemove: () => onFilterChange("sex", ALL),
    });
  }
  if (filters.maritalStatus !== ALL) {
    chips.push({
      key: "marital",
      label: `Marital: ${MARITAL_LABEL[filters.maritalStatus as keyof typeof MARITAL_LABEL]}`,
      onRemove: () => onFilterChange("maritalStatus", ALL),
    });
  }
  if (filters.departmentId !== ALL) {
    chips.push({
      key: "ministry",
      label:
        filters.departmentId === NO_DEPARTMENT_FILTER
          ? "Ministry: Not in any"
          : `Ministry: ${departments?.find((d) => d._id === filters.departmentId)?.name ?? "—"}`,
      onRemove: () => onFilterChange("departmentId", ALL),
    });
  }
  if (filters.leadershipStage !== ALL) {
    chips.push({
      key: "leadership",
      label: `Leadership: ${LEADERSHIP_LABEL[filters.leadershipStage as keyof typeof LEADERSHIP_LABEL]}`,
      onRemove: () => onFilterChange("leadershipStage", ALL),
    });
  }
  if (filters.ageBracket !== ALL) {
    chips.push({
      key: "age",
      label: `Age: ${filters.ageBracket}`,
      onRemove: () => onFilterChange("ageBracket", ALL),
    });
  }
  if (filters.verificationStatus !== ALL) {
    chips.push({
      key: "verification",
      label: `Verification: ${VERIFICATION_LABEL[filters.verificationStatus]}`,
      onRemove: () => onFilterChange("verificationStatus", ALL),
    });
  }
  if (filters.mentorshipStatus !== ALL) {
    chips.push({
      key: "mentorship",
      label: `Mentorship: ${MENTORSHIP_LABEL[filters.mentorshipStatus as keyof typeof MENTORSHIP_LABEL]}`,
      onRemove: () => onFilterChange("mentorshipStatus", ALL),
    });
  }
  if (filters.dateFrom !== undefined) {
    chips.push({
      key: "dateFrom",
      label: `Joined from: ${fmtDate(filters.dateFrom)}`,
      onRemove: () => onFilterChange("dateFrom", undefined),
    });
  }
  if (filters.dateTo !== undefined) {
    chips.push({
      key: "dateTo",
      label: `Joined to: ${fmtDate(filters.dateTo)}`,
      onRemove: () => onFilterChange("dateTo", undefined),
    });
  }

  return (
    <div className="sticky top-16 z-10 -mx-6 border-y border-border bg-parchment/95 px-6 py-2 shadow-e1 backdrop-blur-md lg:-mx-10 lg:px-10">
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <FilterField label="Clan">
          <Select
            value={filters.clanId}
            onValueChange={(v) => onFilterChange("clanId", v)}
          >
            <SelectTrigger className={cn("w-full", COMPACT_TRIGGER)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clans</SelectItem>
              {clans?.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Ministry">
          <Select
            value={filters.departmentId}
            onValueChange={(v) => onFilterChange("departmentId", v)}
          >
            <SelectTrigger className={cn("w-full", COMPACT_TRIGGER)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All ministries</SelectItem>
              <SelectItem value={NO_DEPARTMENT_FILTER}>
                Not in any ministry
              </SelectItem>
              {departments?.map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Gender">
          <SegmentedFilter
            size="sm"
            ariaLabel="Gender"
            value={filters.sex}
            onChange={(v) => onFilterChange("sex", v)}
            options={[
              { value: ALL, label: "All" },
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
          />
        </FilterField>

        <FilterField label="Marital status">
          <Select
            value={filters.maritalStatus}
            onValueChange={(v) => onFilterChange("maritalStatus", v)}
          >
            <SelectTrigger className={cn("w-full", COMPACT_TRIGGER)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="married">Married</SelectItem>
              <SelectItem value="widowed">Widowed</SelectItem>
              <SelectItem value="divorced">Divorced</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Leadership">
          <Select
            value={filters.leadershipStage}
            onValueChange={(v) => onFilterChange("leadershipStage", v)}
          >
            <SelectTrigger className={cn("w-full", COMPACT_TRIGGER)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All stages</SelectItem>
              <SelectItem value="not_enrolled">Not enrolled</SelectItem>
              <SelectItem value="level_1">Level 1</SelectItem>
              <SelectItem value="level_2">Level 2</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <div className="flex items-center gap-1.5 justify-self-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1 px-2.5 text-xs"
              >
                <SlidersHorizontal className="size-3.5" />
                More
                {moreCount > 0 && (
                  <Badge variant="role" className="px-1.5">
                    {moreCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-4" align="end">
              <p className="font-body text-sm font-semibold text-on-surface">
                More filters
              </p>

              <div className="space-y-3">
                <p className="font-body text-xs uppercase tracking-wide text-outline">
                  Age &amp; timing
                </p>
                <FilterField label="Age bracket">
                  <Select
                    value={filters.ageBracket}
                    onValueChange={(v) => onFilterChange("ageBracket", v)}
                  >
                    <SelectTrigger className={cn("w-full", COMPACT_TRIGGER)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All</SelectItem>
                      {AGE_BUCKETS.map((b) => (
                        <SelectItem key={b.label} value={b.label}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
                <div className="grid grid-cols-2 gap-2">
                  <FilterField label="Joined from">
                    <DatePicker
                      value={filters.dateFrom}
                      onChange={(v) => onFilterChange("dateFrom", v)}
                      placeholder="Any date"
                    />
                  </FilterField>
                  <FilterField label="Joined to">
                    <DatePicker
                      value={filters.dateTo}
                      onChange={(v) => onFilterChange("dateTo", v)}
                      placeholder="Any date"
                    />
                  </FilterField>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="font-body text-xs uppercase tracking-wide text-outline">
                  Status
                </p>
                <FilterField label="Verification status">
                  <SegmentedFilter
                    size="sm"
                    ariaLabel="Verification status"
                    value={filters.verificationStatus}
                    onChange={(v) => onFilterChange("verificationStatus", v)}
                    options={[
                      { value: ALL, label: "All" },
                      { value: "pending_verification", label: "Pending" },
                      { value: "verified", label: "Verified" },
                    ]}
                  />
                </FilterField>
                <FilterField label="Mentorship status">
                  <Select
                    value={filters.mentorshipStatus}
                    onValueChange={(v) => onFilterChange("mentorshipStatus", v)}
                  >
                    <SelectTrigger className={cn("w-full", COMPACT_TRIGGER)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All</SelectItem>
                      <SelectItem value="not_enrolled">Not enrolled</SelectItem>
                      <SelectItem value="enrolled">Enrolled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
              </div>
            </PopoverContent>
          </Popover>

          {activeCount > 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={onClear}
              className="h-8 px-0 text-xs"
            >
              Clear all
            </Button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <FilterChip key={chip.key} selected size="sm" onClick={chip.onRemove}>
              <span className="sr-only">Remove filter: </span>
              {chip.label}
              <X className="ml-1 inline size-2.5" aria-hidden="true" />
            </FilterChip>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-body text-xs uppercase tracking-wide text-outline">
        {label}
      </p>
      {children}
    </div>
  );
}
