"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { WeekOfMonth } from "@klt-cyber/shared";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Badge } from "@/components/shadcn/badge";
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
  SwitchField,
  errorMessage,
  formatDate,
  formatRecurrenceSummary,
  formatProgramTimeRange,
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

function emptyForm(): FormState {
  return {
    title: "",
    description: "",
    recurring: true,
    frequency: "weekly",
    daysOfWeek: [0],
    weekOfMonth: "1",
    startDate: undefined,
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

/** DatePicker with a "Clear" affordance next to it — every date in this form
 * is optional, so every date field needs an explicit way back to unset. */
function ClearableDatePicker({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <DatePicker id={id} value={value} onChange={onChange} placeholder={placeholder} className="flex-1" />
      {value !== undefined && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          Clear
        </Button>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-body text-xs uppercase tracking-wide text-outline">{label}</dt>
      <dd className="mt-1 font-body text-sm text-on-surface">
        {children ?? <span className="text-outline">—</span>}
      </dd>
    </div>
  );
}

/** Read-only, formatted display of a program — the Overview tab. Image gets
 * its own column so it renders whole (object-contain, no crop) instead of
 * being squeezed into a wide banner that was cutting heads off. */
function ProgramOverview({ program }: { program: Program }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
      {program.coverImageUrl ? (
        // Signed R2 URLs change per session/domain — plain <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={program.coverImageUrl}
          alt=""
          className="w-full rounded-md object-contain"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-md bg-surface-low text-outline">
          <ImageOff className="h-6 w-6" />
          <span className="font-body text-sm">No cover image</span>
        </div>
      )}

      <dl className="space-y-4">
        <DetailRow label="Title">{program.title}</DetailRow>
        <DetailRow label="Status">
          <Badge variant={program.active ? "verified" : "neutral"}>
            {program.active ? "Active" : "Inactive"}
          </Badge>
        </DetailRow>
        <DetailRow label="Schedule">{formatRecurrenceSummary(program)}</DetailRow>
        <DetailRow label="Time">
          {formatProgramTimeRange(program.startTime ?? program.time ?? "", program.endTime)}
        </DetailRow>
        <DetailRow label="Location">{program.location}</DetailRow>
        <DetailRow label="Created">{formatDate(program._creationTime)}</DetailRow>
        <DetailRow label="Description">{program.description}</DetailRow>
      </dl>
    </div>
  );
}

// Shared create/edit form, opened from WeeklyProgramClient's "Add program"
// button or a card click. Split out from that page since the recurrence
// fields roughly double the form's size — mirrors ActivityDialog.tsx's
// open/onOpenChange/editing-target prop shape. Editing an existing program
// opens into a two-tab Overview/Edit view; creating a new one skips the
// tabs entirely (there's nothing to preview yet).
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

  const [tab, setTab] = useState<"overview" | "edit">("overview");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllPrograms resolves coverImageUrl to a temporary signed URL (7-day
  // expiry) for display — it is never the durable R2 key. Track whether the
  // admin actually touched the image so an untouched edit omits the field
  // from the update payload rather than overwriting the stored key with a
  // signed URL that will 404 once it expires.
  const [coverImageTouched, setCoverImageTouched] = useState(false);

  // The Dialog stays mounted between opens — re-seed the form (and land back
  // on Overview) each time it opens for a (possibly different) edit target.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCoverImageTouched(false);
    setTab("overview");
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
    if (!HHMM.test(form.startTime)) {
      setError("Start time is required.");
      return;
    }
    if (form.recurring && form.daysOfWeek.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }
    if (form.recurring && form.frequency === "biweekly" && form.startDate === undefined) {
      setError("A start date is needed to anchor a program that repeats every 2 weeks.");
      return;
    }

    setBusy(true);
    try {
      const daysOfWeek = form.recurring
        ? form.daysOfWeek
        : [form.startDate !== undefined ? new Date(form.startDate).getDay() : 0];
      // A one-time program can't carry an end date — force it cleared
      // (rather than leaving a stale value) regardless of what a prior
      // recurring configuration left in local state.
      const effectiveEndDate = form.recurring ? form.endDate : undefined;
      // On update, an unset date must be sent as `null` to actually clear a
      // previously-stored value — plain omission just means "don't touch
      // it". On create there's nothing to clear, so omit (undefined) is
      // correct there.
      const startDate = form.startDate ?? (program ? null : undefined);
      const endDate = effectiveEndDate ?? (program ? null : undefined);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        recurrence: form.recurring ? form.frequency : ("once" as const),
        daysOfWeek,
        ...(form.recurring && form.frequency === "monthly"
          ? { weekOfMonth: Number(form.weekOfMonth) as WeekOfMonth }
          : {}),
        startDate,
        endDate,
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
          // createProgram never needs to "clear" a prior value, so it only
          // accepts number|undefined for these — the null branch above is
          // unreachable here at runtime (program is null in this branch),
          // this just satisfies the narrower type.
          startDate: startDate ?? undefined,
          endDate: endDate ?? undefined,
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

  // Two columns — Time and Cover image still get their own full-width rows
  // below since they're the two widest individual controls (a
  // start-to-end time pair; an image dropzone) and would otherwise force
  // whichever column held them to be the tallest.
  const editForm = (
    <div className="space-y-5">
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
          <Field label="Location" htmlFor="program-location">
            <Input
              id="program-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Main hall (optional)"
            />
          </Field>
          <SwitchField
            id="program-active"
            label="Active"
            hint="Visible to members."
            checked={form.active}
            onChange={(value) => set("active", value)}
          />
        </div>

        <div className="space-y-5">
          <SwitchField
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
                    : "Select Mon–Fri for weekday programs."
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
                <Field
                  label="Start date"
                  htmlFor="program-start-date"
                  hint={form.frequency === "biweekly" ? "Required." : "Optional."}
                >
                  <ClearableDatePicker
                    id="program-start-date"
                    value={form.startDate}
                    onChange={(value) => set("startDate", value)}
                    placeholder="No start date"
                  />
                </Field>
                <Field label="End date" htmlFor="program-end-date" hint="Optional.">
                  <ClearableDatePicker
                    id="program-end-date"
                    value={form.endDate}
                    onChange={(value) => set("endDate", value)}
                    placeholder="No end date"
                  />
                </Field>
              </div>
            </>
          ) : (
            <Field label="Date" htmlFor="program-date" hint="Optional — leave blank until confirmed.">
              <ClearableDatePicker
                id="program-date"
                value={form.startDate}
                onChange={(value) => set("startDate", value)}
                placeholder="No date yet"
              />
            </Field>
          )}
        </div>
      </div>

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

      {error && <p className="font-body text-sm text-error">{error}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/* Fixed height (a "sweet spot", not viewport-covering) regardless of
          tab or which fields are showing — grid-rows pins the header/footer
          and lets the middle row absorb all the size variation via its own
          scroll, instead of the whole dialog growing/shrinking under you. */}
      <AnimatedDialogContent
        open={open}
        className="grid h-[640px] max-w-3xl grid-rows-[auto_1fr_auto] gap-4"
      >
        <DialogHeader>
          <DialogTitle>{program ? program.title : "Add program"}</DialogTitle>
        </DialogHeader>

        {program ? (
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "overview" | "edit")}
            className="flex min-h-0 flex-col gap-3"
          >
            <TabsList className="w-fit shrink-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="min-h-0 overflow-y-auto pr-1">
              <ProgramOverview program={program} />
            </TabsContent>
            <TabsContent value="edit" className="min-h-0 overflow-y-auto pr-1">
              {editForm}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 overflow-y-auto pr-1">{editForm}</div>
        )}

        <DialogFooter>
          {program && tab === "overview" ? (
            <Button size="sm" onClick={() => setTab("edit")}>
              Edit
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => !busy && onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" loading={busy} onClick={submit}>
                {program ? "Save" : "Create"}
              </Button>
            </>
          )}
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
