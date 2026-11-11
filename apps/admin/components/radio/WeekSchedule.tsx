"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CalendarPlus, CalendarX2, Pencil, RotateCcw } from "lucide-react";
import {
  formatKampalaDayHeading,
  formatKampalaTime,
  formatRadioDuration,
  groupBroadcastsByKampalaDay,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Badge } from "@/components/shadcn/badge";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { cn } from "@/lib/utils";
import { BroadcastDialog, type MediaWeekRow } from "./BroadcastDialog";
import { radioError } from "./radioErrors";

const ORIGIN_LABEL: Record<MediaWeekRow["origin"], string | null> = {
  scheduled: null,
  oneOff: "One off",
  auto: "Unscheduled",
};

/**
 * The Radio page's week (spec 0019, AC-20 to AC-22): today to seven days out
 * in Kampala time, grouped by day, with add by hand, adjust, cancel and
 * restore. A cancelled airing stays in the list, marked, so it can be
 * restored.
 */
export function WeekSchedule({ now }: { now: number }) {
  const rows = useAuthQuery(api.radio.listMediaWeek, {});
  const cancel = useMutation(api.radioBroadcasts.cancel);
  const restore = useMutation(api.radioBroadcasts.restore);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MediaWeekRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openFor(row: MediaWeekRow | null) {
    setEditing(row);
    setDialogOpen(true);
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="radio-week-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading as="h2" size="lg" id="radio-week-heading">
            This week
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Weekly programs are written a week ahead every night. Anything you add,
            move or cancel here stays exactly as you left it.
          </p>
        </div>
        <Button size="sm" onClick={() => openFor(null)}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Add broadcast
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
          {error}
        </p>
      )}

      {rows === undefined ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
        </div>
      ) : rows === null ? (
        <ErrorState retry={() => window.location.reload()} />
      ) : rows.length === 0 ? (
        <div className="rounded-md bg-surface-lowest shadow-e1">
          <EmptyState
            title="Nothing on the schedule this week"
            message="Add a program on the Programs page, or add a one off broadcast here."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groupBroadcastsByKampalaDay(rows).map((group) => (
            <div key={group.dateKey} className="space-y-2">
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-outline">
                {formatKampalaDayHeading(group.dateKey, now)}
              </p>
              <ul className="space-y-2">
                {group.items.map((row) => {
                  const cancelled = row.status === "cancelled";
                  const onAir = !cancelled && row.startsAt <= now && now < row.endsAt;
                  const over = row.endsAt <= now;
                  const origin = ORIGIN_LABEL[row.origin];
                  return (
                    <li
                      key={row._id}
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-md bg-surface-lowest px-4 py-3 shadow-e1",
                        (cancelled || over) && "opacity-70",
                      )}
                    >
                      <span className="w-20 shrink-0 font-mono text-sm text-on-surface">
                        {formatKampalaTime(row.startsAt)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate font-body text-sm font-semibold text-on-surface",
                            cancelled && "line-through",
                          )}
                        >
                          {row.title}
                        </p>
                        <p className="truncate font-body text-xs text-on-surface-variant">
                          <span className="font-mono">
                            {formatRadioDuration((row.endsAt - row.startsAt) / 60_000)}
                          </span>
                          {row.host ? ` · ${row.host}` : ""}
                          {row.hostInherited && row.host ? " (program host)" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {onAir && <Badge variant="rejected">On air</Badge>}
                        {cancelled && <Badge variant="rejected">Cancelled</Badge>}
                        {origin && <Badge variant="role">{origin}</Badge>}
                        {row.adjusted && row.origin === "scheduled" && (
                          <Badge variant="neutral">Adjusted</Badge>
                        )}
                        {!row.isRecorded && <Badge variant="neutral">Not recorded</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row._id}
                          onClick={() => openFor(row)}
                          aria-label={`Adjust ${row.title}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        {cancelled ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row._id}
                            onClick={() => void run(row._id, () => restore({ broadcastId: row._id }))}
                            aria-label={`Restore ${row.title}`}
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden />
                          </Button>
                        ) : (
                          !over && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === row._id}
                              onClick={() => void run(row._id, () => cancel({ broadcastId: row._id }))}
                              aria-label={`Cancel ${row.title}`}
                            >
                              <CalendarX2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <BroadcastDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </section>
  );
}
