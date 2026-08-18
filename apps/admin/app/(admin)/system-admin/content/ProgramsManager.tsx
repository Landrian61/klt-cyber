"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Doc, type Id } from "@/lib/api";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Badge } from "@/components/shadcn/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Field,
  CheckboxField,
  ContentRow,
  errorMessage,
  DAY_OPTIONS,
  DAY_LABELS,
} from "./shared";

type Program = Doc<"weeklyPrograms">;

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

function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${match[2]} ${period}`;
}

export function ProgramsManager() {
  const programs = useAuthQuery(api.weeklyPrograms.listAllPrograms, {});
  const createProgram = useMutation(api.weeklyPrograms.createProgram);
  const updateProgram = useMutation(api.weeklyPrograms.updateProgram);
  const toggleActive = useMutation(api.weeklyPrograms.toggleProgramActive);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllPrograms resolves coverImageUrl to a temporary signed URL (7-day
  // expiry), not the durable R2 key — see convex/lib/media.ts. Track whether
  // the admin actually touched the image so an untouched save omits the field
  // from the update payload rather than overwriting the stored key with a
  // URL that will 404 once it expires.
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
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        dayOfWeek: Number(form.dayOfWeek),
        time: form.time,
        location: form.location.trim() || undefined,
        active: form.active,
      };
      if (editing) {
        // coverImageUrl from the query is a temporary signed URL (7-day
        // expiry), not the durable R2 key — only send it back when the admin
        // actually replaced/removed the image. Omitting the key leaves the
        // stored value untouched (see convex/weeklyPrograms.ts).
        await updateProgram({
          programId: editing._id as Id<"weeklyPrograms">,
          ...base,
          ...(coverImageTouched
            ? { coverImageUrl: form.coverImageUrl.trim() || undefined }
            : {}),
        });
      } else {
        await createProgram({
          ...base,
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

  async function flip(program: Program) {
    try {
      await toggleActive({ programId: program._id as Id<"weeklyPrograms">, active: !program.active });
    } catch {
      // Reactive list corrects itself; nothing to surface for a toggle.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-on-surface-variant">
          Recurring weekly slots. Inactive programs stay hidden from members.
        </p>
        <Button size="sm" onClick={openNew}>
          New program
        </Button>
      </div>

      {!programs ? (
        <p className="font-body text-sm text-outline">Loading…</p>
      ) : programs.length === 0 ? (
        <EmptyState title="No programs yet" message="Add the church's recurring weekly programs." />
      ) : (
        <div className="space-y-2">
          {programs.map((program) => (
            <ContentRow
              key={program._id}
              title={program.title}
              meta={`${DAY_LABELS[program.dayOfWeek]} · ${formatTime(program.time)}${program.location ? ` · ${program.location}` : ""}`}
              badges={
                program.active ? (
                  <Badge variant="verified">Active</Badge>
                ) : (
                  <Badge variant="neutral">Inactive</Badge>
                )
              }
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(program)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => flip(program)}>
                    {program.active ? "Deactivate" : "Activate"}
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) setOpen(false);
        }}
      >
        <SheetContent side="right" className="gap-0">
          <SheetHeader className="pr-8">
            <SheetTitle>{editing ? "Edit program" : "New program"}</SheetTitle>
          </SheetHeader>
          <div className="mt-5 flex-1 overflow-y-auto">
            <div className="space-y-5">
          <Field label="Title" htmlFor="program-title">
            <Input id="program-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Sunday Service" />
          </Field>
          <Field label="Description" htmlFor="program-desc">
            <Textarea id="program-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What happens at this program (optional)" />
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
            <Field label="Time" htmlFor="program-time" hint="Church-local (Africa/Kampala).">
              <Input id="program-time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
            </Field>
          </div>
          <Field label="Location" htmlFor="program-loc">
            <Input id="program-loc" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="KLT Main Auditorium (optional)" />
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
              <CheckboxField id="program-active" label="Active (visible to members)" checked={form.active} onChange={(value) => set("active", value)} />
              {error && <p className="font-body text-sm text-error">{error}</p>}
            </div>
          </div>
          <SheetFooter className="mt-5 flex-row items-center justify-end gap-2">
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
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
