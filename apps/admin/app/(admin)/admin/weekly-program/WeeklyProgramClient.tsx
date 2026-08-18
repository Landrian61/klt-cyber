"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Field,
  CheckboxField,
  errorMessage,
  formatTime,
  DAY_OPTIONS,
  DAY_LABELS,
} from "../_lib/adminContent";

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
  const toggleActive = useMutation(api.weeklyPrograms.toggleProgramActive);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"weeklyPrograms"> | null>(
    null,
  );
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

  async function toggle(program: Program) {
    setTogglingId(program._id);
    try {
      await toggleActive({ programId: program._id, active: !program.active });
    } catch {
      // Reactive list corrects itself; nothing to surface for a toggle.
    } finally {
      setTogglingId(null);
    }
  }

  const columns: Column<Program>[] = [
    {
      key: "day",
      header: "Day",
      render: (program) => (
        <span className="text-on-surface">{DAY_LABELS[program.dayOfWeek]}</span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (program) => (
        <span className="font-medium text-on-surface">{program.title}</span>
      ),
    },
    {
      key: "time",
      header: "Time",
      render: (program) => (
        <span className="font-mono text-on-surface-variant">
          {formatTime(program.time)}
        </span>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (program) => (
        <span className="text-on-surface-variant">
          {program.location ?? "—"}
        </span>
      ),
    },
    {
      key: "active",
      header: "Active",
      render: (program) =>
        program.active ? (
          <Badge variant="verified">On</Badge>
        ) : (
          <Badge variant="neutral">Off</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (program) => (
        <Button
          variant="ghost"
          size="sm"
          loading={togglingId === program._id}
          onClick={(event) => {
            event.stopPropagation();
            void toggle(program);
          }}
        >
          {program.active ? "Turn off" : "Turn on"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
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
        </div>
        <Button size="sm" onClick={openNew}>
          Add program
        </Button>
      </header>

      <DataTable<Program>
        columns={columns}
        rows={programs ?? undefined}
        rowKey={(program) => program._id}
        onRowClick={openEdit}
        skeletonRows={4}
        empty={
          <EmptyState
            title="No weekly programs yet"
            message="Add the church's recurring schedule — Sunday service, Wednesday prayer meeting, and similar."
            action={
              <Button size="sm" onClick={openNew}>
                Add program
              </Button>
            }
          />
        }
      />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit program" : "Add program"}</DialogTitle>
          </DialogHeader>

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
                <Input
                  id="program-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => set("time", e.target.value)}
                />
              </Field>
            </div>
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
            {error && <p className="font-body text-sm text-error">{error}</p>}
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
