"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle } from "lucide-react";
import {
  PROGRAM_CANCELLATION_REASON_MAX_LENGTH,
  formatOccurrenceDate,
  isPastOccurrence,
} from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Textarea } from "@/components/shadcn/textarea";
import { CheckboxField, Field, errorMessage } from "../_lib/adminContent";

// Calling off one dated occurrence of a recurring program, and putting it back
// (spec 0009, A4-02 / A4-03). One dialog for all three actions, because they
// are the same decision seen from different sides and each is one short form.

/** Which of the three things the dialog is open to do. */
export type OccurrenceAction = "cancel" | "restore" | "reason";

/**
 * The occurrence being acted on, taken straight off the planner's program item.
 *
 * `date` MUST be the item's own `date` — the Kampala calendar day the server
 * stamped. It is never derived from the clicked `Date` here: YearPlannerClient
 * buckets days by browser-local time, so an admin working outside Kampala
 * would otherwise send a day that is off by one and cancel the wrong night.
 */
export interface TargetOccurrence {
  programId: Id<"weeklyPrograms">;
  date: string;
  title: string;
  /** The occurrence's start instant, for the 48-hour pre-tick below. */
  start: number;
  cancelled: boolean;
  cancellationReason?: string;
  notifiedAt?: number;
}

const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

/**
 * Whether "Notify members" starts ticked (AC-2, AC-3).
 *
 * Unticked normally, so a quiet administrative correction stays quiet. Ticked
 * inside 48 hours, because the day-before reminder fires immediately at 09:00
 * Kampala and cannot be retracted — once it has gone out, or is about to,
 * silence would leave the church acting on a reminder for something that is
 * not happening. This is a mitigation and not a fix: a cancellation entered
 * this late means members get the reminder and then the correction, in that
 * order.
 *
 * Never for a date that has already passed. The 48-hour test on its own is
 * "anything up to 48 hours from now", which every past date also satisfies —
 * a restore on a night called off two weeks ago would arrive pre-ticked,
 * recommending a push that tells the whole church a long-gone date is back on.
 */
function shouldPreTickNotify(occurrence: TargetOccurrence): boolean {
  if (isPastOccurrence(occurrence.date)) return false;
  return occurrence.start - Date.now() <= TWO_DAYS_MS;
}

const COPY: Record<OccurrenceAction, { title: string; confirm: string }> = {
  cancel: { title: "Cancel this occurrence", confirm: "Cancel occurrence" },
  restore: { title: "Put this occurrence back on", confirm: "Restore occurrence" },
  reason: { title: "Edit the reason", confirm: "Save reason" },
};

export function OccurrenceDialog({
  open,
  action,
  occurrence,
  onOpenChange,
}: {
  open: boolean;
  action: OccurrenceAction;
  occurrence: TargetOccurrence | null;
  onOpenChange: (open: boolean) => void;
}) {
  const cancelOccurrence = useMutation(api.weeklyPrograms.cancelOccurrence);
  const restoreOccurrence = useMutation(api.weeklyPrograms.restoreOccurrence);
  const updateReason = useMutation(api.weeklyPrograms.updateCancellationReason);

  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Dialog stays mounted between opens, so re-seed every time it opens for
  // a (possibly different) occurrence.
  useEffect(() => {
    if (!open || !occurrence) return;
    setError(null);
    setReason(action === "reason" ? (occurrence.cancellationReason ?? "") : "");
    setNotify(action === "reason" ? false : shouldPreTickNotify(occurrence));
  }, [open, action, occurrence]);

  if (!occurrence) return null;

  const copy = COPY[action];
  const when = formatOccurrenceDate(occurrence.date);
  const overLimit = reason.trim().length > PROGRAM_CANCELLATION_REASON_MAX_LENGTH;
  // Only reachable on a restore: DayPopup does not offer "cancel this date" on
  // a day that has gone, and a cancellation record outlives its date.
  const past = isPastOccurrence(occurrence.date);

  async function submit() {
    if (!occurrence) return;
    setError(null);
    if (overLimit) {
      setError(`A reason can be at most ${PROGRAM_CANCELLATION_REASON_MAX_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      const target = { programId: occurrence.programId, date: occurrence.date };
      // The server refuses to notify for a past date anyway; sending false
      // keeps the request honest rather than leaning on that.
      const notifyMembers = !past && notify;
      if (action === "cancel") {
        await cancelOccurrence({
          ...target,
          reason: reason.trim() || undefined,
          notify: notifyMembers,
        });
      } else if (action === "restore") {
        await restoreOccurrence({ ...target, notify: notifyMembers });
      } else {
        await updateReason({ ...target, reason: reason.trim() || undefined });
      }
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {occurrence.title} on {when}. The program itself and every other date
            stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {action === "restore" ? (
            <>
              {occurrence.cancellationReason && (
                <p className="font-body text-sm text-on-surface-variant">
                  It was called off because: {occurrence.cancellationReason}
                </p>
              )}
              {/* Not for a past date: the option to tell them is withheld
                  below, so "tell them it is back on" would be advice the
                  dialog gives and then refuses to act on. */}
              {occurrence.notifiedAt !== undefined && !past && (
                <div className="flex items-start gap-2.5 rounded-lg bg-crimson-light px-3 py-2.5">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-crimson"
                    aria-hidden="true"
                  />
                  <p className="font-body text-sm text-on-surface">
                    Members were told this occurrence was cancelled. Tell them it is
                    back on, or they may not come.
                  </p>
                </div>
              )}
            </>
          ) : (
            <Field label="Reason (optional)" htmlFor="occurrence-reason">
              <Textarea
                id="occurrence-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The hall is being repainted"
                aria-describedby="occurrence-reason-count"
              />
              <p
                id="occurrence-reason-count"
                className={`mt-1.5 font-mono text-xs ${
                  overLimit ? "text-error" : "text-on-surface-variant"
                }`}
              >
                {reason.trim().length} / {PROGRAM_CANCELLATION_REASON_MAX_LENGTH}
              </p>
              <p className="mt-1 font-body text-xs text-on-surface-variant">
                Members can see this, so say what they need to know.
              </p>
            </Field>
          )}

          {/* Correcting a reason never notifies — the church has already been
              told it is off, and a second push with better wording is noise.
              Nor does anything on a date that has already passed: there is
              nothing left for members to act on, so the option is withheld
              rather than offered and then refused by the server. */}
          {action !== "reason" && past && (
            <p className="font-body text-xs text-on-surface-variant">
              This date has passed, so members are not notified.
            </p>
          )}
          {action !== "reason" && !past && (
            <div className="space-y-1.5">
              <CheckboxField
                id="occurrence-notify"
                label="Notify members"
                checked={notify}
                onChange={setNotify}
              />
              {shouldPreTickNotify(occurrence) && (
                <p className="font-body text-xs text-on-surface-variant">
                  This is within the next two days, so a reminder may already have
                  gone out. Leaving this ticked is strongly recommended.
                </p>
              )}
            </div>
          )}

          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => !busy && onOpenChange(false)}>
            {action === "cancel" ? "Never mind" : "Close"}
          </Button>
          <Button
            size="sm"
            variant={action === "cancel" ? "destructive" : "default"}
            loading={busy}
            onClick={submit}
          >
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
