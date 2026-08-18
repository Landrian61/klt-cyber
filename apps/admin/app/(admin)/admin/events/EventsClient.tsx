"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Doc, type Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { DateTimePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  CardGrid,
  CheckboxField,
  ContentCard,
  Field,
  errorMessage,
  formatDateTime,
} from "../_lib/adminContent";

type EventDoc = Doc<"events">;
type Tab = "upcoming" | "past";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

interface FormState {
  title: string;
  description: string;
  location: string;
  startDateTime: number | undefined;
  endDateTime: number | undefined;
  coverImageUrl: string;
  featured: boolean;
  active: boolean;
}

const EMPTY: FormState = {
  title: "",
  description: "",
  location: "",
  startDateTime: undefined,
  endDateTime: undefined,
  coverImageUrl: "",
  featured: false,
  active: true,
};

export function EventsClient() {
  const events = useAuthQuery(api.events.listAllEvents, {});
  const createEvent = useMutation(api.events.createEvent);
  const updateEvent = useMutation(api.events.updateEvent);

  const [tab, setTab] = useState<Tab>("upcoming");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventDoc | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [coverImageTouched, setCoverImageTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => {
    if (!events) return { upcoming: undefined, past: undefined };
    const now = Date.now();
    const visible = events.filter((event) => event.active);
    return {
      upcoming: visible
        .filter((event) => event.startDateTime >= now)
        .sort((a, b) => a.startDateTime - b.startDateTime),
      past: visible
        .filter((event) => event.startDateTime < now)
        .sort((a, b) => b.startDateTime - a.startDateTime),
    };
  }, [events]);

  const shown = tab === "upcoming" ? upcoming : past;

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setCoverImageTouched(false);
    setError(null);
    setOpen(true);
  }

  function openEdit(event: EventDoc) {
    setEditing(event);
    setForm({
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      coverImageUrl: event.coverImageUrl ?? "",
      featured: event.featured,
      active: event.active,
    });
    setCoverImageTouched(false);
    setError(null);
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
    if (form.startDateTime === undefined || form.endDateTime === undefined) {
      setError("Start and end date/time are required.");
      return;
    }
    if (form.endDateTime < form.startDateTime) {
      setError("End must be on or after start.");
      return;
    }
    setBusy(true);
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startDateTime: form.startDateTime,
        endDateTime: form.endDateTime,
        featured: form.featured,
        active: form.active,
      };
      if (editing) {
        await updateEvent({
          eventId: editing._id as Id<"events">,
          ...base,
          // The query resolves coverImageUrl to a temporary signed URL for
          // display, not the durable R2 key — only resubmit it when the
          // admin actually changed the image, otherwise omit the field so
          // the mutation's `!== undefined` check leaves the stored key
          // (or absence of one) untouched.
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Events
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          One-off events, shown separately from the weekly schedule on mobile.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          options={TAB_OPTIONS}
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          ariaLabel="Upcoming or past events"
        />
        <Button size="sm" onClick={openNew}>
          Add event
        </Button>
      </div>

      {!shown ? (
        <CardGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-md bg-surface-lowest"
            />
          ))}
        </CardGrid>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "upcoming" ? "No upcoming events" : "No past events"}
          message={
            tab === "upcoming"
              ? "Add an event and it will show here once it's on."
              : "Events move here automatically once their date has passed."
          }
        />
      ) : (
        <CardGrid>
          {shown.map((event) => (
            <ContentCard
              key={event._id}
              coverImageUrl={event.coverImageUrl}
              title={event.title}
              meta={`${formatDateTime(event.startDateTime)}${
                event.location ? ` · ${event.location}` : ""
              }`}
              marker={event.featured ? "★" : undefined}
              onClick={() => openEdit(event)}
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
            <DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <Field label="Title" htmlFor="event-title" className="md:col-span-2">
              <Input
                id="event-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Youth outreach day"
              />
            </Field>
            <div className="space-y-5">
              <Field label="Description" htmlFor="event-desc">
                <Textarea
                  id="event-desc"
                  rows={4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What this event is about (optional)"
                />
              </Field>
              <Field label="Location" htmlFor="event-loc">
                <Input
                  id="event-loc"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Downtown (optional)"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Starts" htmlFor="event-start">
                  <DateTimePicker
                    id="event-start"
                    value={form.startDateTime}
                    onChange={(value) => set("startDateTime", value)}
                  />
                </Field>
                <Field label="Ends" htmlFor="event-end">
                  <DateTimePicker
                    id="event-end"
                    value={form.endDateTime}
                    onChange={(value) => set("endDateTime", value)}
                  />
                </Field>
              </div>
            </div>
            <div className="space-y-5">
              <Field label="Cover image" hint="Shown at the top of the card (optional).">
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
                <CheckboxField
                  id="event-featured"
                  label="Featured"
                  checked={form.featured}
                  onChange={(value) => set("featured", value)}
                />
                <CheckboxField
                  id="event-active"
                  label="Active (visible to members)"
                  checked={form.active}
                  onChange={(value) => set("active", value)}
                />
              </div>
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
