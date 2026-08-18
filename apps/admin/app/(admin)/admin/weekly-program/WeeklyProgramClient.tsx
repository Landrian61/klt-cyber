"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import {
  CardGrid,
  ContentCard,
  Field,
  CheckboxField,
  errorMessage,
  formatTime,
  DAY_OPTIONS,
  DAY_LABELS,
} from "../_lib/adminContent";

type Tab = "active" | "inactive";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Row shape comes straight from the Convex query — coverImageUrl arrives
// already resolved to a display-ready URL (or undefined), no hand-rolled drift.
type Program = NonNullable<
  FunctionReturnType<typeof api.weeklyPrograms.listAllPrograms>
>[number];

interface FormState {
  title: string;
  description: string;
  dayOfWeek: string;
  time: string;
  location: string;
  coverImageUrl: string;
  active: boolean;
}

const EMPTY: FormState = {
  title: "",
  description: "",
  dayOfWeek: "0",
  time: "",
  location: "",
  coverImageUrl: "",
  active: true,
};

export function WeeklyProgramClient() {
  const programs = useAuthQuery(api.weeklyPrograms.listAllPrograms, {});
  const createProgram = useMutation(api.weeklyPrograms.createProgram);
  const updateProgram = useMutation(api.weeklyPrograms.updateProgram);

  const [tab, setTab] = useState<Tab>("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllPrograms resolves coverImageUrl to a temporary signed URL (7-day
  // expiry) for display — it is never the durable R2 key. Track whether the
  // admin actually touched the image so an untouched edit omits the field
  // from the update payload rather than overwriting the stored key with a
  // signed URL that will 404 once it expires.
  const [coverImageTouched, setCoverImageTouched] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setCoverImageTouched(false);
    setOpen(true);
  }

  function openEdit(program: Program) {
    setEditing(program);
    setForm({
      title: program.title,
      description: program.description ?? "",
      dayOfWeek: String(program.dayOfWeek),
      time: program.time,
      location: program.location ?? "",
      coverImageUrl: program.coverImageUrl ?? "",
      active: program.active,
    });
    setError(null);
    setCoverImageTouched(false);
    setOpen(true);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) {
      setError("Time is required in 24h HH:mm format.");
      return;
    }
    setBusy(true);
    try {
      const basePayload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        dayOfWeek: Number(form.dayOfWeek),
        time: form.time,
        location: form.location.trim() || undefined,
        active: form.active,
      };
      if (editing) {
        await updateProgram({
          programId: editing._id,
          ...basePayload,
          // Only send coverImageUrl when the admin actually changed it — the
          // form's current value is a temporary signed display URL, not the
          // durable R2 key, so resending it unchanged would overwrite the
          // stored key and 404 once the signed URL expires. Omitting the key
          // entirely leaves the stored value untouched (see updateProgram).
          ...(coverImageTouched
            ? { coverImageUrl: form.coverImageUrl.trim() || undefined }
            : {}),
        });
      } else {
        await createProgram({
          ...basePayload,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
        });
      }
      setOpen(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
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
          recurring programs
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
              ? "Add the church's recurring schedule — Sunday service, Wednesday prayer meeting, and similar."
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
              meta={`${DAY_LABELS[program.dayOfWeek]} · ${formatTime(program.time)}${
                program.location ? ` · ${program.location}` : ""
              }`}
              onClick={() => openEdit(program)}
            />
          ))}
        </CardGrid>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) setOpen(false);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit program" : "Add program"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <Field label="Title" htmlFor="program-title" className="md:col-span-2">
              <Input
                id="program-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Sunday service"
              />
            </Field>

            <div className="space-y-5">
              <Field label="Description" htmlFor="program-description">
                <Textarea
                  id="program-description"
                  rows={4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What happens at this program (optional)"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Day of week" htmlFor="program-day">
                  <Select
                    value={form.dayOfWeek}
                    onValueChange={(value) => set("dayOfWeek", value)}
                  >
                    <SelectTrigger id="program-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Time"
                  htmlFor="program-time"
                  hint="Church-local (Africa/Kampala)."
                >
                  <input
                    id="program-time"
                    type="time"
                    value={form.time}
                    onChange={(e) => set("time", e.target.value)}
                    className="h-11 w-full rounded-md bg-surface-low px-3 text-center font-body text-base text-on-surface outline-none focus-visible:brightness-95"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-5">
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
              <p className="font-body text-sm text-error md:col-span-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => !busy && setOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={submit}>
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
