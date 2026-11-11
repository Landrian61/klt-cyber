"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  RADIO_BROADCAST_MAX_MS,
  RADIO_DURATION_MAX_MINUTES,
  RADIO_ONE_OFF_NAME_MAX_LENGTH,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Switch } from "@/components/shadcn/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { HostField, hostValueFrom, type RadioHostValue } from "./HostField";
import { kampalaFormParts, kampalaInstant } from "./kampalaTime";
import { radioError } from "./radioErrors";

export type MediaWeekRow = NonNullable<
  FunctionReturnType<typeof api.radio.listMediaWeek>
>[number];

type NameMode = "oneOff" | "program";

/**
 * Add a broadcast by hand, or adjust one (AC-20 to AC-22, AC-24, AC-17).
 *
 * Adding takes a typed one off name or an existing program (the way an
 * occasional program gets an airing). Adjusting changes the times, host or
 * record flag of that one airing; a one off or unscheduled row can also be
 * renamed or attached to a program. Times are Kampala time.
 */
export function BroadcastDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: MediaWeekRow | null;
}) {
  const programs = useAuthQuery(api.radioPrograms.list, open ? {} : "skip");
  const createByHand = useMutation(api.radioBroadcasts.createByHand);
  const adjust = useMutation(api.radioBroadcasts.adjust);
  const rename = useMutation(api.radioBroadcasts.rename);

  const [nameMode, setNameMode] = useState<NameMode>("oneOff");
  const [oneOffName, setOneOffName] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [date, setDate] = useState<number | undefined>(undefined);
  const [time, setTime] = useState("");
  const [length, setLength] = useState("60");
  const [host, setHost] = useState<RadioHostValue>({ kind: "none" });
  const [isRecorded, setIsRecorded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      const parts = kampalaFormParts(editing.startsAt);
      setNameMode(editing.programId ? "program" : "oneOff");
      setOneOffName(editing.oneOffName ?? "");
      setProgramId(editing.programId ?? "");
      setDate(parts.date);
      setTime(parts.time);
      setLength(String(Math.round((editing.endsAt - editing.startsAt) / 60_000)));
      setHost(hostValueFrom(editing));
      setIsRecorded(editing.isRecorded);
    } else {
      setNameMode("oneOff");
      setOneOffName("");
      setProgramId("");
      setDate(undefined);
      setTime("");
      setLength("60");
      setHost({ kind: "none" });
      setIsRecorded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const renameable = !editing || editing.origin === "auto" || editing.origin === "oneOff";
  const chosenProgram = (programs ?? []).find((p) => p._id === programId);
  const effectiveSuperT =
    nameMode === "program" && (chosenProgram?.isSuperT ?? editing?.isSuperT ?? false);
  const timesLocked = !!editing?.hasRecording;

  // Picking a program fills its usual length and record flag on a new row.
  function chooseProgram(id: string) {
    setProgramId(id);
    const p = (programs ?? []).find((row) => row._id === id);
    if (p && !editing) {
      setLength(String(p.durationMinutes));
      setTime((current) => current || p.startTime);
      setIsRecorded(p.isSuperT ? false : p.recordByDefault);
    }
    if (p?.isSuperT) setIsRecorded(false);
  }

  const lengthMinutes = Number(length);
  const startsAt = date !== undefined && time ? kampalaInstant(date, time) : null;
  const endsAt = startsAt !== null ? startsAt + lengthMinutes * 60_000 : null;
  const timesValid =
    startsAt !== null &&
    endsAt !== null &&
    Number.isInteger(lengthMinutes) &&
    lengthMinutes >= 1 &&
    endsAt - startsAt <= RADIO_BROADCAST_MAX_MS;
  const nameValid =
    nameMode === "oneOff" ? oneOffName.trim().length > 0 : programId.length > 0;
  const canSave = timesValid && (!renameable || nameValid);

  async function save() {
    if (!canSave || startsAt === null || endsAt === null) return;
    setSaving(true);
    setError(null);
    const recorded = effectiveSuperT ? false : isRecorded;
    try {
      if (!editing) {
        await createByHand({
          ...(nameMode === "oneOff"
            ? { oneOffName: oneOffName.trim() }
            : { programId: programId as Id<"radioPrograms"> }),
          startsAt,
          endsAt,
          host,
          isRecorded: recorded,
        });
      } else {
        if (renameable) {
          const nameChanged =
            nameMode === "oneOff"
              ? oneOffName.trim() !== (editing.oneOffName ?? "") || !!editing.programId
              : programId !== (editing.programId ?? "");
          if (nameChanged) {
            await rename({
              broadcastId: editing._id,
              ...(nameMode === "oneOff"
                ? { oneOffName: oneOffName.trim() }
                : { programId: programId as Id<"radioPrograms"> }),
            });
          }
        }
        await adjust({
          broadcastId: editing._id,
          ...(timesLocked ? {} : { startsAt, endsAt }),
          host,
          isRecorded: recorded,
        });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setSaving(false);
    }
  }

  const activePrograms = (programs ?? []).filter((p) => p.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatedDialogContent open={open} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Adjust ${editing.title}` : "Add a broadcast"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "This changes only this airing. The nightly schedule will leave it alone from now on."
              : "A one off broadcast, or an extra airing of an existing program. Times are Kampala time."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {renameable && (
            <>
              <Field label="What is airing" htmlFor="broadcast-name-mode">
                <Select value={nameMode} onValueChange={(next) => setNameMode(next as NameMode)}>
                  <SelectTrigger id="broadcast-name-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oneOff">A one off, with its own name</SelectItem>
                    <SelectItem value="program">One of our programs</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {nameMode === "oneOff" ? (
                <Field
                  label="Name"
                  htmlFor="broadcast-one-off"
                  hint="A one off never becomes a recurring program."
                >
                  <Input
                    id="broadcast-one-off"
                    value={oneOffName}
                    maxLength={RADIO_ONE_OFF_NAME_MAX_LENGTH}
                    onChange={(event) => setOneOffName(event.target.value)}
                    placeholder="Easter Crusade"
                  />
                </Field>
              ) : (
                <Field label="Program" htmlFor="broadcast-program">
                  <Select value={programId} onValueChange={chooseProgram}>
                    <SelectTrigger id="broadcast-program">
                      <SelectValue placeholder="Choose a program" />
                    </SelectTrigger>
                    <SelectContent>
                      {activePrograms.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name}
                          {p.recurrence === "occasional" ? " (occasional)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="broadcast-date">
              <DatePicker id="broadcast-date" value={date} onChange={setDate} disabled={timesLocked} />
            </Field>
            <Field label="Starts" htmlFor="broadcast-time">
              <TimePicker
                id="broadcast-time"
                value={time}
                onChange={setTime}
                minuteStep={5}
                disabled={timesLocked}
              />
            </Field>
            <Field label="Length in minutes" htmlFor="broadcast-length">
              <Input
                id="broadcast-length"
                type="number"
                inputMode="numeric"
                min={1}
                max={RADIO_DURATION_MAX_MINUTES}
                value={length}
                disabled={timesLocked}
                onChange={(event) => setLength(event.target.value)}
                className="font-mono"
              />
            </Field>
          </div>
          {timesLocked && (
            <p className="font-body text-xs text-on-surface-variant">
              This broadcast has a recording, so its times can no longer change.
            </p>
          )}

          <HostField
            idPrefix="broadcast"
            value={host}
            onChange={setHost}
            currentMemberName={editing?.hostUserId ? editing.host : null}
            noneLabel={nameMode === "program" ? "The program's host" : "No host listed"}
            disabled={saving}
          />

          <label className="flex items-center gap-2">
            <Switch
              checked={effectiveSuperT ? false : isRecorded}
              disabled={effectiveSuperT}
              onCheckedChange={setIsRecorded}
            />
            <span className="font-body text-sm font-medium text-on-surface">
              Record this airing
            </span>
          </label>
          {effectiveSuperT && (
            <p className="font-body text-xs text-on-surface-variant">Super T is never recorded.</p>
          )}

          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <ActionButton
            variant="gold"
            onClick={() => void save()}
            disabled={saving || !canSave}
            loading={saving}
          >
            {editing ? "Save changes" : "Add broadcast"}
          </ActionButton>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
