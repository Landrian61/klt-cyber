"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  RADIO_DURATION_MAX_MINUTES,
  RADIO_DURATION_MIN_MINUTES,
  RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH,
  RADIO_PROGRAM_NAME_MAX_LENGTH,
  radioProgramInputSchema,
  type RadioProgramRecurrence,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
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
import { ImageUpload } from "@/components/ui/ImageUpload";
import { TimePicker } from "@/components/ui/TimePicker";
import { cn } from "@/lib/utils";
import { HostField, hostValueFrom, type RadioHostValue } from "./HostField";
import { WEEKDAY_SHORT } from "./kampalaTime";
import { radioError } from "./radioErrors";

export type RadioProgramRow = NonNullable<
  FunctionReturnType<typeof api.radioPrograms.list>
>[number];

/**
 * Add or edit one recurring program (AC-18, AC-22, AC-24). The form stops the
 * typist with the shared schema first; the mutation runs every check again.
 */
export function ProgramDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: RadioProgramRow | null;
}) {
  const create = useMutation(api.radioPrograms.create);
  const update = useMutation(api.radioPrograms.update);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [recurrence, setRecurrence] = useState<RadioProgramRecurrence>("weekly");
  const [recordByDefault, setRecordByDefault] = useState(true);
  const [followedByDefault, setFollowedByDefault] = useState(false);
  const [host, setHost] = useState<RadioHostValue>({ kind: "none" });
  const [imageKey, setImageKey] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the row once per opening, so a live update underneath never
  // overwrites a half typed edit.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setDays(editing?.days ?? []);
    setStartTime(editing?.startTime ?? "");
    setDuration(String(editing?.durationMinutes ?? 60));
    setRecurrence(editing?.recurrence ?? "weekly");
    setRecordByDefault(editing ? editing.recordByDefault : true);
    setFollowedByDefault(editing?.followedByDefault ?? false);
    setHost(editing ? hostValueFrom(editing) : { kind: "none" });
    setImageKey(editing?.imageKey ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isSuperT = !!editing?.isSuperT;
  const durationMinutes = Number(duration);
  const parsed = radioProgramInputSchema.safeParse({
    name,
    description,
    days,
    startTime,
    durationMinutes,
    recurrence,
    recordByDefault,
    followedByDefault,
    hostGuestName: host.kind === "guest" ? host.name : undefined,
    hostUserId: host.kind === "member" ? host.userId : undefined,
  });
  const problem = (path: string) =>
    parsed.success
      ? undefined
      : parsed.error.issues.find((i) => i.path[0] === path)?.message;
  const touched = name.length > 0 || days.length > 0 || startTime.length > 0;

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  async function save() {
    if (!parsed.success) return;
    setSaving(true);
    setError(null);
    const fields = {
      name,
      description,
      days,
      startTime,
      durationMinutes,
      recurrence,
      recordByDefault: isSuperT ? false : recordByDefault,
      followedByDefault,
      host,
      imageKey,
    };
    try {
      if (editing) await update({ programId: editing._id, ...fields });
      else await create(fields);
      onOpenChange(false);
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatedDialogContent open={open} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit program" : "Add a program"}</DialogTitle>
          <DialogDescription>
            Times are Kampala time. A weekly program is written onto the schedule a
            week ahead; an occasional one only airs when you add it by hand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" htmlFor="program-name" error={touched ? problem("name") : undefined}>
            <Input
              id="program-name"
              value={name}
              maxLength={RADIO_PROGRAM_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder="Morning Glory"
            />
          </Field>

          <Field label="Description" htmlFor="program-description" hint="Shown on the schedule and the player.">
            <Textarea
              id="program-description"
              value={description}
              rows={3}
              maxLength={RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="font-body text-sm font-medium text-on-surface">Days</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
              {WEEKDAY_SHORT.map((label, day) => {
                const on = days.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "h-9 rounded-full px-4 font-body text-sm font-medium transition-colors",
                      on
                        ? "bg-primary text-on-primary"
                        : "bg-surface-low text-on-surface-variant hover:bg-primary-light",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {touched && problem("days") && (
              <p className="font-body text-xs text-destructive">{problem("days")}</p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starts" htmlFor="program-start" error={touched ? problem("startTime") : undefined}>
              <TimePicker id="program-start" value={startTime} onChange={setStartTime} minuteStep={5} />
            </Field>
            <Field
              label="Length in minutes"
              htmlFor="program-duration"
              error={touched ? problem("durationMinutes") : undefined}
              hint="Super T runs the full 1440."
            >
              <Input
                id="program-duration"
                type="number"
                inputMode="numeric"
                min={RADIO_DURATION_MIN_MINUTES}
                max={RADIO_DURATION_MAX_MINUTES}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label="Repeats" htmlFor="program-recurrence">
              <Select
                value={recurrence}
                onValueChange={(next) => setRecurrence(next as RadioProgramRecurrence)}
              >
                <SelectTrigger id="program-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="occasional">Occasionally, added by hand</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <HostField
            idPrefix="program"
            value={host}
            onChange={setHost}
            currentMemberName={editing?.hostUserId ? editing.hostName : null}
            noneLabel="No host listed"
            disabled={saving}
          />

          <div className="space-y-2">
            <p className="font-body text-sm font-medium text-on-surface">Image</p>
            <ImageUpload value={imageKey} onChange={setImageKey} disabled={saving} />
            <p className="font-body text-xs text-on-surface-variant">
              Optional. Without one the app shows the program&rsquo;s own artwork, or the
              church theme.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <Switch
                checked={isSuperT ? false : recordByDefault}
                disabled={isSuperT}
                onCheckedChange={setRecordByDefault}
              />
              <span className="font-body text-sm font-medium text-on-surface">
                Record every airing by default
              </span>
            </label>
            {isSuperT && (
              <p className="font-body text-xs text-on-surface-variant">
                Super T is never recorded.
              </p>
            )}
            <label className="flex items-center gap-2">
              <Switch checked={followedByDefault} onCheckedChange={setFollowedByDefault} />
              <span className="font-body text-sm font-medium text-on-surface">
                Followed by default, so members get a push when it goes live
              </span>
            </label>
          </div>

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
            disabled={saving || !parsed.success}
            loading={saving}
          >
            {editing ? "Save changes" : "Add program"}
          </ActionButton>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
