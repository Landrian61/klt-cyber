"use client";

import { useMemo, useState } from "react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import {
  CardGrid,
  ContentCard,
  formatRecurrenceSummary,
  formatProgramTimeRange,
} from "../_lib/adminContent";
import { WeeklyProgramDialog, type Program } from "./WeeklyProgramDialog";

type Tab = "active" | "inactive";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function WeeklyProgramClient() {
  const programs = useAuthQuery(api.weeklyPrograms.listAllPrograms, {});

  const [tab, setTab] = useState<Tab>("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(program: Program) {
    setEditing(program);
    setOpen(true);
  }

  const shown = useMemo(() => {
    if (!programs) return undefined;
    return programs.filter((program) =>
      tab === "active" ? program.active : !program.active,
    );
  }, [programs, tab]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Weekly program
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          {programs ? (
            <span className="font-mono">{programs.length}</span>
          ) : (
            <span aria-hidden="true">—</span>
          )}{" "}
          programs
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          ariaLabel="Active or inactive programs"
          options={TAB_OPTIONS}
          value={tab}
          onChange={(value) => setTab(value as Tab)}
        />
        <Button size="sm" onClick={openNew}>
          Add program
        </Button>
      </div>

      {!shown ? (
        <CardGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-md" />
          ))}
        </CardGrid>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "active" ? "No active programs" : "No inactive programs"}
          message={
            tab === "active"
              ? "Add the church's schedule — Sunday service, Wednesday prayer meeting, and similar."
              : "Programs turned off from the schedule land here — still editable."
          }
        />
      ) : (
        <CardGrid>
          {shown.map((program) => (
            <ContentCard
              key={program._id}
              coverImageUrl={program.coverImageUrl}
              title={program.title}
              meta={`${formatRecurrenceSummary(program)} · ${formatProgramTimeRange(
                program.startTime ?? program.time ?? "",
                program.endTime,
              )}${program.location ? ` · ${program.location}` : ""}`}
              onClick={() => openEdit(program)}
            />
          ))}
        </CardGrid>
      )}

      <WeeklyProgramDialog open={open} onOpenChange={setOpen} program={editing} />
    </div>
  );
}
