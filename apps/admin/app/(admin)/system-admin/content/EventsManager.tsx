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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Badge } from "@/components/shadcn/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Field,
  CheckboxField,
  ContentRow,
  errorMessage,
  formatDateTime,
  toDateTimeInput,
  fromDateTimeInput,
} from "./shared";

type EventDoc = Doc<"events">;

interface FormState {
  title: string;
  description: string;
  location: string;
  startDateTime: string;
  endDateTime: string;
  coverImageUrl: string;
  featured: boolean;
  active: boolean;
}

const EMPTY: FormState = {
  title: "",
  description: "",
  location: "",
  startDateTime: "",
  endDateTime: "",
  coverImageUrl: "",
  featured: false,
  active: true,
};

export function EventsManager() {
  const events = useAuthQuery(api.events.listAllEvents, {});
  const createEvent = useMutation(api.events.createEvent);
  const updateEvent = useMutation(api.events.updateEvent);
  const archiveEvent = useMutation(api.events.archiveEvent);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventDoc | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<EventDoc | null>(null);
  // listAllEvents resolves coverImageUrl to a temporary signed URL (7-day
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

  function openEdit(event: EventDoc) {
    setEditing(event);
    setForm({
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      startDateTime: toDateTimeInput(event.startDateTime),
      endDateTime: toDateTimeInput(event.endDateTime),
      coverImageUrl: event.coverImageUrl ?? "",
      featured: event.featured,
      active: event.active,
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
    if (!form.startDateTime || !form.endDateTime) {
      setError("Start and end date/time are required.");
      return;
    }
    const startDateTime = fromDateTimeInput(form.startDateTime);
    const endDateTime = fromDateTimeInput(form.endDateTime);
    if (endDateTime < startDateTime) {
      setError("End must be on or after start.");
      return;
    }
    setBusy(true);
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startDateTime,
        endDateTime,
        featured: form.featured,
        active: form.active,
      };
      if (editing) {
        // coverImageUrl from the query is a temporary signed URL (7-day
        // expiry), not the durable R2 key — only send it back when the admin
        // actually replaced/removed the image. Omitting the key leaves the
        // stored value untouched (see convex/events.ts).
        await updateEvent({
          eventId: editing._id as Id<"events">,
          ...base,
          ...(coverImageTouched
            ? { coverImageUrl: form.coverImageUrl.trim() || undefined }
            : {}),
        });
      } else {
        await createEvent({
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

  async function doArchive() {
    if (!confirmArchive) return;
    setBusy(true);
    try {
      await archiveEvent({ eventId: confirmArchive._id as Id<"events"> });
      setConfirmArchive(null);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-on-surface-variant">
          One-off events. Archiving hides an event without deleting it.
        </p>
        <Button size="sm" onClick={openNew}>
          New event
        </Button>
      </div>

      {!events ? (
        <p className="font-body text-sm text-outline">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyState title="No events yet" message="Add upcoming events for members to see." />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <ContentRow
              key={event._id}
              title={event.title}
              meta={`${formatDateTime(event.startDateTime)}${event.location ? ` · ${event.location}` : ""}`}
              badges={
                <>
                  {event.featured && <Badge variant="member">Featured</Badge>}
                  {event.active ? (
                    <Badge variant="verified">Active</Badge>
                  ) : (
                    <Badge variant="neutral">Archived</Badge>
                  )}
                </>
              }
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(event)}>
                    Edit
                  </Button>
                  {event.active && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(event)}>
                      Archive
                    </Button>
                  )}
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
            <SheetTitle>{editing ? "Edit event" : "New event"}</SheetTitle>
          </SheetHeader>
          <div className="mt-5 flex-1 overflow-y-auto">
            <div className="space-y-5">
          <Field label="Title" htmlFor="event-title">
            <Input id="event-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Holy Ghost Night" />
          </Field>
          <Field label="Description" htmlFor="event-desc">
            <Textarea id="event-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What this event is about (optional)" />
          </Field>
          <Field label="Location" htmlFor="event-loc">
            <Input id="event-loc" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="KLT Main Auditorium (optional)" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" htmlFor="event-start">
              <Input id="event-start" type="datetime-local" value={form.startDateTime} onChange={(e) => set("startDateTime", e.target.value)} />
            </Field>
            <Field label="Ends" htmlFor="event-end">
              <Input id="event-end" type="datetime-local" value={form.endDateTime} onChange={(e) => set("endDateTime", e.target.value)} />
            </Field>
          </div>
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
          <div className="flex flex-col gap-3">
            <CheckboxField id="event-featured" label="Featured (Home tab slider)" checked={form.featured} onChange={(value) => set("featured", value)} />
            <CheckboxField id="event-active" label="Active (visible to members)" checked={form.active} onChange={(value) => set("active", value)} />
          </div>
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

      <Dialog
        open={confirmArchive !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirmArchive(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive event?</DialogTitle>
            <DialogDescription>
              “{confirmArchive?.title}” will be hidden from members. You can
              re-activate it later by editing it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => !busy && setConfirmArchive(null)}
            >
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={doArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
