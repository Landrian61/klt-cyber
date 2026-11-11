"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CalendarClock, Plus } from "lucide-react";
import { formatRadioDuration } from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/shadcn/badge";
import { Switch } from "@/components/shadcn/switch";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { ProgramDialog, type RadioProgramRow } from "./ProgramDialog";
import { WEEKDAY_SHORT } from "./kampalaTime";
import { radioError } from "./radioErrors";

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Media's Programs page (spec 0019, AC-18, AC-21): the recurring programs,
 * inactive ones included, with add, edit and the active switch. Read through
 * `radioPrograms.list`, which returns null without `manageRadio`.
 */
export function ProgramsPage() {
  const programs = useAuthQuery(api.radioPrograms.list, { includeInactive: true });
  const setActive = useMutation(api.radioPrograms.setActive);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RadioProgramRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openFor(row: RadioProgramRow | null) {
    setEditing(row);
    setDialogOpen(true);
  }

  async function toggle(row: RadioProgramRow, isActive: boolean) {
    setBusyId(row._id);
    setError(null);
    try {
      await setActive({ programId: row._id, isActive });
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<RadioProgramRow>[] = [
    {
      key: "name",
      header: "Program",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-on-surface">{row.name}</p>
          <p className="truncate font-body text-xs text-on-surface-variant">
            {row.hostName ?? "No host listed"}
          </p>
        </div>
      ),
    },
    {
      key: "when",
      header: "When",
      render: (row) => (
        <div className="font-body text-sm text-on-surface">
          <p>
            {row.recurrence === "occasional"
              ? "Occasional"
              : row.days.map((d) => WEEKDAY_SHORT[d]).join(", ")}
          </p>
          <p className="text-xs text-on-surface-variant">
            <span className="font-mono">{timeLabel(row.startTime)}</span> ·{" "}
            <span className="font-mono">{formatRadioDuration(row.durationMinutes)}</span>
          </p>
        </div>
      ),
    },
    {
      key: "flags",
      header: "Defaults",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.recordByDefault && <Badge variant="member">Recorded</Badge>}
          {row.followedByDefault && <Badge variant="role">Followed</Badge>}
          {row.isSuperT && <Badge variant="neutral">Never recorded</Badge>}
        </div>
      ),
    },
    {
      key: "active",
      header: "Active",
      align: "right",
      render: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Switch
            checked={row.isActive}
            disabled={busyId === row._id}
            aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.name}`}
            onCheckedChange={(next) => void toggle(row, next)}
          />
        </span>
      ),
    },
  ];

  if (programs === null) {
    return (
      <div className="space-y-6">
        <Heading as="h1" size="xl">
          Programs
        </Heading>
        <ErrorState retry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading as="h1" size="xl">
            Programs
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Reign Radio&rsquo;s recurring programs. Changing one rewrites only its future
            airings nobody has touched; deactivating removes those airings.
          </p>
        </div>
        <Button size="sm" onClick={() => openFor(null)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add program
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
          {error}
        </p>
      )}

      <Reveal>
        <DataTable
          columns={columns}
          rows={programs}
          rowKey={(row) => row._id}
          onRowClick={(row) => openFor(row)}
          empty={
            <EmptyState
              icon={<CalendarClock className="h-8 w-8" aria-hidden />}
              title="No programs yet"
              message="Add the first recurring program, or ask a System Admin to run the radio programs seed."
            />
          }
        />
      </Reveal>

      <ProgramDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
