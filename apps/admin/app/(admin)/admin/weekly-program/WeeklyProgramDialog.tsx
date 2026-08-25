"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { WeekOfMonth } from "@klt-cyber/shared";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { FilterChip } from "@/components/ui/FilterBar";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeRangeField } from "@/components/ui/TimePicker";
import { ImageUpload } from "@/components/ui/ImageUpload";
import {
  Field,
  CheckboxField,
  errorMessage,
  DAY_OPTIONS,
  FREQUENCY_OPTIONS,
  WEEK_OF_MONTH_OPTIONS,
} from "../_lib/adminContent";

// Row shape comes straight from the Convex query — coverImageUrl arrives
// already resolved to a display-ready URL (or undefined), no hand-rolled drift.
export type Program = NonNullable<
  FunctionReturnType<typeof api.weeklyPrograms.listAllPrograms>
>[number];

type Frequency = "weekly" | "biweekly" | "monthly";

interface FormState {
  title: string;
  description: string;
  recurring: boolean;
  frequency: Frequency;
  daysOfWeek: number[];
  weekOfMonth: string; // WEEK_OF_MONTH_OPTIONS value; only sent when frequency === "monthly"
  startDate: number | undefined; // the program's one date when !recurring
  endDate: number | undefined;
  startTime: string;
  endTime: string;
  location: string;
  coverImageUrl: string;
  active: boolean;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function todayMidnight(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function emptyForm(): FormState {
  return {
    title: "",
    description: "",
    recurring: true,
    frequency: "weekly",
    daysOfWeek: [0],
    weekOfMonth: "1",
    startDate: todayMidnight(),
    endDate: undefined,
    startTime: "",
    endTime: "",
    location: "",
    coverImageUrl: "",
    active: true,
  };
}

function formFromProgram(program: Program): FormState {
  const recurrence = (program.recurrence ?? "weekly") as
    | "once"
    | "weekly"
    | "biweekly"
    | "monthly";
  return {
    title: program.title,
    description: program.description ?? "",
    recurring: recurrence !== "once",
    frequency: recurrence === "once" ? "weekly" : recurrence,
    daysOfWeek:
      program.daysOfWeek ?? (program.dayOfWeek !== undefined ? [program.dayOfWeek] : [0]),
    weekOfMonth: program.weekOfMonth !== undefined ? String(program.weekOfMonth) : "1",
    startDate: program.startDate,
    endDate: program.endDate,
    startTime: program.startTime ?? program.time ?? "",
    endTime: program.endTime ?? "",
    location: program.location ?? "",
    coverImageUrl: program.coverImageUrl ?? "",
    active: program.active,
  };
}

// Shared create/edit form, opened from WeeklyProgramClient's "Add program"
// button or a card click. Split out from that page since the recurrence
// fields roughly double the form's size — mirrors ActivityDialog.tsx's
// open/onOpenChange/editing-target prop shape.
export function WeeklyProgramDialog({
  open,
  onOpenChange,
  program,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: Program | null;
}) {
  const createProgram = useMutation(api.weeklyPrograms.createProgram);
  const updateProgram = useMutation(api.weeklyPrograms.updateProgram);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllPrograms resolves coverImageUrl to a temporary signed URL (7-day
  // expiry) for display — it is never the durable R2 key. Track whether the
  // admin actually touched the image so an untouched edit omits the field
  // from the update payload rather than overwriting the stored key with a
  // signed URL that will 404 once it expires.
  const [coverImageTouched, setCoverImageTouched] = useState(false);

  // The Dialog stays mounted between opens — re-seed the form each time it
  // opens for a (possibly different) edit target.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCoverImageTouched(false);
    setForm(program ? formFromProgram(program) : emptyForm());
  }, [open, program]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setFrequency(frequency: Frequency) {
    setForm((prev) => ({
      ...prev,
      frequency,
      // Monthly needs exactly one day — collapse to the first selection
      // rather than leaving a stale multi-day set the server would reject.
      daysOfWeek: frequency === "monthly" ? [prev.daysOfWeek[0] ?? 0] : prev.daysOfWeek,
    }));
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      if (prev.frequency === "monthly") {
        return { ...prev, daysOfWeek: [day] };
      }
      const already = prev.daysOfWeek.includes(day);
      return {
        ...prev,
        daysOfWeek: already
          ? prev.daysOfWeek.filter((d) => d !== day)
          : [...prev.daysOfWeek, day],
      };
    });
  }

  async function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (form.startDate === undefined) {
      setError(form.recurring ? "Start date is required." : "Date is required.");
      return;
    }
    if (!HHMM.test(form.startTime)) {
      setError("Start time is required in 24h HH:mm format.");
      return;
    }
    if (form.recurring && form.daysOfWeek.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }

    setBusy(true);
    try {
      const daysOfWeek = form.recurring
        ? form.daysOfWeek
        : [new Date(form.startDate).getDay()]; // derive the single day for a one-time program
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        recurrence: form.recurring ? form.frequency : ("once" as const),
        daysOfWeek,
        ...(form.recurring && form.frequency === "monthly"
          ? { weekOfMonth: Number(form.weekOfMonth) as WeekOfMonth }
          : {}),
        startDate: form.startDate,
        ...(form.recurring && form.endDate !== undefined
          ? { endDate: form.endDate }
          : {}),
        startTime: form.startTime,
        ...(form.endTime ? { endTime: form.endTime } : {}),
        location: form.location.trim() || undefined,
        active: form.active,
      };
      if (program) {
        await updateProgram({
          programId: program._id,
          ...payload,
          // Only send coverImageUrl when the admin actually changed it — see
          // the note above coverImageTouched.
          ...(coverImageTouched
            ? { coverImageUrl: form.coverImageUrl.trim() || undefined }
            : {}),
        });
      } else {
        await createProgram({
          ...payload,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
        });
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{program ? "Edit program" : "Add program"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="space-y-5">
            <Field label="Title" htmlFor="program-title">
              <Input
                id="program-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Sunday service"
              />
            </Field>
            <Field label="Description" htmlFor="program-description">
              <Textarea
                id="program-description"
                rows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What happens at this program (optional)"
              />
            </Field>

            <CheckboxField
              id="program-recurring"
              label="Recurring program"
              checked={form.recurring}
              onChange={(value) => set("recurring", value)}
            />

            {form.recurring ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Frequency" htmlFor="program-frequency">
                    <Select
                      value={form.frequency}
                      onValueChange={(value) => setFrequency(value as Frequency)}
                    >
                      <SelectTrigger id="program-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {form.frequency === "monthly" && (
                    <Field label="Week of month" htmlFor="program-week-of-month">
                      <Select
                        value={form.weekOfMonth}
                        onValueChange={(value) => set("weekOfMonth", value)}
                      >
                        <SelectTrigger id="program-week-of-month">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_OF_MONTH_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>

                <Field
                  label="Days"
                  hint={
                    form.frequency === "monthly"
                      ? "Pick one day."
                      : "Pick every day this program runs — select Mon–Fri for weekday programs."
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {DAY_OPTIONS.map((option) => (
                      <FilterChip
                        key={option.value}
                        selected={form.daysOfWeek.includes(Number(option.value))}
                        onClick={() => toggleDay(Number(option.value))}
                      >
                        {option.label}
                      </FilterChip>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start date" htmlFor="program-start-date">
                    <DatePicker
                      id="program-start-date"
                      value={form.startDate}
                      onChange={(value) => set("startDate", value)}
                    />
                  </Field>
                  <Field
                    label="End date"
                    htmlFor="program-end-date"
                    hint="Optional — blank repeats indefinitely."
                  >
                    <div className="flex items-center gap-2">
                      <DatePicker
                        id="program-end-date"
                        value={form.endDate}
                        onChange={(value) => set("endDate", value)}
                        placeholder="No end date"
                        className="flex-1"
                      />
                      {form.endDate !== undefined && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => set("endDate", undefined)}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </Field>
                </div>
              </>
            ) : (
              <Field label="Date" htmlFor="program-date">
                <DatePicker
                  id="program-date"
                  value={form.startDate}
                  onChange={(value) => set("startDate", value)}
                />
              </Field>
            )}
          </div>

          <div className="space-y-5">
            <Field
              label="Time"
              htmlFor="program-start-time"
              hint="Church-local (Africa/Kampala). End time is optional."
            >
              <TimeRangeField
                startId="program-start-time"
                endId="program-end-time"
                startValue={form.startTime}
                endValue={form.endTime}
                onStartChange={(value) => set("startTime", value)}
                onEndChange={(value) => set("endTime", value)}
              />
            </Field>
            <Field label="Location" htmlFor="program-location">
              <Input
                id="program-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Main hall (optional)"
              />
            </Field>
            <Field label="Cover image" hint="Upload the image members see (optional).">
              <ImageUpload
                value={form.coverImageUrl || undefined}
                onChange={(value) => {
                  set("coverImageUrl", value ?? "");
                  setCoverImageTouched(true);
                }}
                disabled={busy}
              />
            </Field>
            <CheckboxField
              id="program-active"
              label="Active (visible to members)"
              checked={form.active}
              onChange={(value) => set("active", value)}
            />
          </div>

          {error && (
            <p className="font-body text-sm text-error sm:col-span-2">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => !busy && onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" loading={busy} onClick={submit}>
            {program ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
