"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { DateTimePicker } from "@/components/ui/DatePicker";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Field, SwitchField, errorMessage, formatDateTime } from "../_lib/adminContent";

// Row shape comes straight from the Convex query — coverImageUrl arrives
// already resolved to a display-ready URL (or undefined), no hand-rolled drift.
export type Event = NonNullable<FunctionReturnType<typeof api.events.listAllEvents>>[number];

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

function emptyForm(): FormState {
  return {
    title: "",
    description: "",
    location: "",
    startDateTime: undefined,
    endDateTime: undefined,
    coverImageUrl: "",
    featured: false,
    active: true,
  };
}

function formFromEvent(event: Event): FormState {
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    coverImageUrl: event.coverImageUrl ?? "",
    featured: event.featured,
    active: event.active,
  };
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

/** Read-only, formatted display of an event — the Overview tab. Image gets
 * its own column so it renders whole (object-contain, no crop). */
function EventOverview({ event }: { event: Event }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
      {event.coverImageUrl ? (
        // Signed R2 URLs change per session/domain — plain <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverImageUrl}
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
        <DetailRow label="Title">{event.title}</DetailRow>
        <DetailRow label="Status">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={event.active ? "verified" : "neutral"}>
              {event.active ? "Active" : "Archived"}
            </Badge>
            {event.featured && <Badge variant="member">Featured</Badge>}
          </div>
        </DetailRow>
        <DetailRow label="Starts">{formatDateTime(event.startDateTime)}</DetailRow>
        <DetailRow label="Ends">{formatDateTime(event.endDateTime)}</DetailRow>
        <DetailRow label="Location">{event.location}</DetailRow>
        <DetailRow label="Created">{formatDateTime(event._creationTime)}</DetailRow>
        <DetailRow label="Description">{event.description}</DetailRow>
      </dl>
    </div>
  );
}

// Shared create/edit dialog, opened from EventsClient's "Add event" button or
// a card click. Editing an existing event opens into a two-tab
// Overview/Edit view (plus a quick Archive action on Overview, ported from
// the now-retired system-admin EventsManager.tsx); creating a new one skips
// the tabs entirely.
export function EventDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event | null;
}) {
  const createEvent = useMutation(api.events.createEvent);
  const updateEvent = useMutation(api.events.updateEvent);
  const archiveEvent = useMutation(api.events.archiveEvent);

  const [tab, setTab] = useState<"overview" | "edit">("overview");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  // listAllEvents resolves coverImageUrl to a temporary signed URL (7-day
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
    setForm(event ? formFromEvent(event) : emptyForm());
  }, [open, event]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startDateTime: form.startDateTime,
        endDateTime: form.endDateTime,
        featured: form.featured,
        active: form.active,
      };
      if (event) {
        await updateEvent({
          eventId: event._id,
          ...payload,
          // Only send coverImageUrl when the admin actually changed it — see
          // the note above coverImageTouched.
          ...(coverImageTouched
            ? { coverImageUrl: form.coverImageUrl.trim() || undefined }
            : {}),
        });
      } else {
        await createEvent({
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

  async function doArchive() {
    if (!event) return;
    setBusy(true);
    try {
      await archiveEvent({ eventId: event._id });
      setConfirmingArchive(false);
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  const editForm = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <div className="space-y-5">
          <Field label="Title" htmlFor="event-title">
            <Input
              id="event-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Youth outreach day"
            />
          </Field>
          <Field label="Description" htmlFor="event-description">
            <Textarea
              id="event-description"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What this event is about (optional)"
            />
          </Field>
          <Field label="Location" htmlFor="event-location">
            <Input
              id="event-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Downtown (optional)"
            />
          </Field>
          <SwitchField
            id="event-active"
            label="Active"
            hint="Visible to members."
            checked={form.active}
            onChange={(value) => set("active", value)}
          />
        </div>

        <div className="space-y-5">
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
          <SwitchField
            id="event-featured"
            label="Featured"
            hint="Shows in the Home tab slider."
            checked={form.featured}
            onChange={(value) => set("featured", value)}
          />
        </div>
      </div>

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

      {error && <p className="font-body text-sm text-error">{error}</p>}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        {/* Fixed height (a "sweet spot", not viewport-covering) regardless of
            tab — grid-rows pins the header/footer and lets the middle row
            absorb all the size variation via its own scroll. */}
        <AnimatedDialogContent
          open={open}
          className="grid h-[640px] max-w-4xl grid-rows-[auto_1fr_auto] gap-4"
        >
          <DialogHeader>
            <DialogTitle>{event ? event.title : "Add event"}</DialogTitle>
          </DialogHeader>

          {event ? (
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as "overview" | "edit")}
              className="flex min-h-0 flex-col gap-3"
            >
              <TabsList className="w-fit shrink-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="min-h-0 overflow-y-auto px-1">
                <EventOverview event={event} />
              </TabsContent>
              <TabsContent value="edit" className="min-h-0 overflow-y-auto px-1">
                {editForm}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="min-h-0 overflow-y-auto px-1">{editForm}</div>
          )}

          <DialogFooter>
            {event && tab === "overview" ? (
              <>
                {event.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingArchive(true)}
                  >
                    Archive
                  </Button>
                )}
                <Button size="sm" onClick={() => setTab("edit")}>
                  Edit
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => !busy && onOpenChange(false)}>
                  Cancel
                </Button>
                <Button size="sm" loading={busy} onClick={submit}>
                  {event ? "Save" : "Create"}
                </Button>
              </>
            )}
          </DialogFooter>
        </AnimatedDialogContent>
      </Dialog>

      <Dialog
        open={confirmingArchive}
        onOpenChange={(next) => !busy && setConfirmingArchive(next)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive event?</DialogTitle>
            <DialogDescription>
              &ldquo;{event?.title}&rdquo; will be hidden from members. You can re-activate it
              later by editing it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => !busy && setConfirmingArchive(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={doArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
