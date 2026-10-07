"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { Badge, type BadgeVariant } from "@/components/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { DatePicker } from "@/components/ui/DatePicker";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Field, PriorityBadge, errorMessage, formatDate } from "../_lib/adminContent";

// Row shape comes straight from the Convex query — coverImageUrl arrives
// already resolved to a display-ready URL (or undefined), no hand-rolled drift.
export type Announcement = NonNullable<
  FunctionReturnType<typeof api.announcements.listAllAnnouncements>
>[number];

type Priority = "low" | "normal" | "high";
type LinkRow = { label: string; url: string };

interface FormState {
  title: string;
  body: string;
  category: string;
  priority: Priority;
  coverImageUrl: string;
  links: LinkRow[];
  startDate: number | undefined;
  endDate: number | undefined;
}

function emptyForm(): FormState {
  return {
    title: "",
    body: "",
    category: "",
    priority: "normal",
    coverImageUrl: "",
    links: [],
    startDate: undefined,
    endDate: undefined,
  };
}

function formFromAnnouncement(a: Announcement): FormState {
  return {
    title: a.title,
    body: a.body,
    category: a.category ?? "",
    priority: a.priority ?? "normal",
    coverImageUrl: a.coverImageUrl ?? "",
    links: a.links ? a.links.map((l) => ({ ...l })) : [],
    startDate: a.startDate,
    endDate: a.endDate,
  };
}

/** End-of-day snap for a period end, so a same-day window is non-empty. */
function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Derived lifecycle label from stored status + date window — more useful on
 * Overview than the raw "published" stored value, which doesn't say whether
 * a published announcement's window has actually started or already lapsed. */
function lifecycle(a: Announcement): { label: string; variant: BadgeVariant } {
  const now = Date.now();
  if (a.status === "archived") return { label: "Archived", variant: "neutral" };
  if (a.status === "draft") return { label: "Draft", variant: "pending" };
  if (now < a.startDate) return { label: "Scheduled", variant: "member" };
  if (now > a.endDate) return { label: "Expired", variant: "neutral" };
  return { label: "Active", variant: "verified" };
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

/** Read-only, formatted display of an announcement — the Overview tab. Image
 * gets its own column so it renders whole (object-contain, no crop). */
function AnnouncementOverview({ a }: { a: Announcement }) {
  const state = lifecycle(a);
  return (
    <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
      {a.coverImageUrl ? (
        // Signed R2 URLs change per session/domain — plain <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.coverImageUrl} alt="" className="w-full rounded-md object-contain" />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-md bg-surface-low text-outline">
          <ImageOff className="h-6 w-6" />
          <span className="font-body text-sm">No cover image</span>
        </div>
      )}

      <dl className="space-y-4">
        <DetailRow label="Title">{a.title}</DetailRow>
        <DetailRow label="Status">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={state.variant}>{state.label}</Badge>
            <PriorityBadge priority={a.priority} />
          </div>
        </DetailRow>
        <DetailRow label="Category">{a.category}</DetailRow>
        <DetailRow label="Window">
          {formatDate(a.startDate)} – {formatDate(a.endDate)}
        </DetailRow>
        <DetailRow label="Links">
          {a.links && a.links.length > 0 ? (
            <ul className="space-y-1">
              {a.links.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : undefined}
        </DetailRow>
        <DetailRow label="Created">{formatDate(a._creationTime)}</DetailRow>
        <DetailRow label="Body">{a.body}</DetailRow>
      </dl>
    </div>
  );
}

// Shared create/edit dialog, opened from AnnouncementsClient's "Add
// announcement" button or a card click. Editing an existing announcement
// opens into a two-tab Overview/Edit view, with the status-transition
// actions (Publish/Disable/Archive) surfaced on Overview rather than as
// permanent Edit-tab buttons — Disable is ported over from the now-retired
// system-admin AnnouncementsManager.tsx, which had it but this dialog
// didn't. Creating a new one skips the tabs entirely.
export function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
}) {
  const createAnnouncement = useMutation(api.announcements.createAnnouncement);
  const updateAnnouncement = useMutation(api.announcements.updateAnnouncement);
  const publishAnnouncement = useMutation(api.announcements.publishAnnouncement);
  const disableAnnouncement = useMutation(api.announcements.disableAnnouncement);
  const archiveAnnouncement = useMutation(api.announcements.archiveAnnouncement);

  const [tab, setTab] = useState<"overview" | "edit">("overview");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllAnnouncements resolves coverImageUrl to a temporary signed URL
  // (7-day expiry) for display — it is never the durable R2 key. Track
  // whether the admin actually touched the image so an untouched edit omits
  // the field from the update payload rather than overwriting the stored
  // key with a signed URL that will 404 once it expires.
  const [coverImageTouched, setCoverImageTouched] = useState(false);

  // The Dialog stays mounted between opens — re-seed the form (and land back
  // on Overview) each time it opens for a (possibly different) edit target.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCoverImageTouched(false);
    setTab("overview");
    setForm(announcement ? formFromAnnouncement(announcement) : emptyForm());
  }, [open, announcement]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setLink(index: number, patch: Partial<LinkRow>) {
    setForm((prev) => ({
      ...prev,
      links: prev.links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    }));
  }

  function buildPayload() {
    if (!form.title.trim() || !form.body.trim()) {
      throw new Error("Title and body are required.");
    }
    if (form.startDate === undefined || form.endDate === undefined) {
      throw new Error("Start and end dates are required.");
    }
    const startDate = form.startDate;
    const endDate = endOfDay(form.endDate);
    if (endDate < startDate) {
      throw new Error("End date must be on or after start date.");
    }
    const links = form.links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url);
    return {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category.trim() || undefined,
      priority: form.priority,
      links: links.length ? links : undefined,
      startDate,
      endDate,
    };
  }

  async function handleSave(publishStatus?: "draft" | "published") {
    setError(null);
    let payload;
    try {
      payload = buildPayload();
    } catch (validationError) {
      setError(errorMessage(validationError));
      return;
    }
    const coverImageUrl = form.coverImageUrl.trim() || undefined;
    setBusy(true);
    try {
      if (announcement) {
        await updateAnnouncement({
          announcementId: announcement._id,
          ...payload,
          ...(coverImageTouched ? { coverImageUrl } : {}),
        });
      } else {
        await createAnnouncement({
          ...payload,
          coverImageUrl,
          status: publishStatus ?? "draft",
        });
      }
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  async function runTransition(fn: (id: Announcement["_id"]) => Promise<unknown>) {
    if (!announcement) return;
    setError(null);
    setBusy(true);
    try {
      await fn(announcement._id);
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
          <Field label="Title" htmlFor="ann-title">
            <Input
              id="ann-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Water Baptism this Saturday"
            />
          </Field>
          <Field label="Body" htmlFor="ann-body">
            <Textarea
              id="ann-body"
              rows={5}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Full announcement text…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" htmlFor="ann-category">
              <Input
                id="ann-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="General"
              />
            </Field>
            <Field label="Priority" htmlFor="ann-priority">
              <Select
                value={form.priority}
                onValueChange={(value) => set("priority", value as Priority)}
              >
                <SelectTrigger id="ann-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" htmlFor="ann-start">
              <DatePicker
                id="ann-start"
                value={form.startDate}
                onChange={(value) => set("startDate", value)}
              />
            </Field>
            <Field label="End date" htmlFor="ann-end">
              <DatePicker
                id="ann-end"
                value={form.endDate}
                onChange={(value) => set("endDate", value)}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-5">
          <Field label="Cover image" hint="Shown at the top of the card and in the mobile feed.">
            <ImageUpload
              value={form.coverImageUrl || undefined}
              onChange={(value) => {
                set("coverImageUrl", value ?? "");
                setCoverImageTouched(true);
              }}
              disabled={busy}
            />
          </Field>
          <div>
            <div className="flex items-center justify-between">
              <span className="font-body text-sm font-medium text-on-surface-variant">Links</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set("links", [...form.links, { label: "", url: "" }])}
              >
                Add link
              </Button>
            </div>
            {/* The one genuinely unbounded field in this form — capped with
                its own small scroll region rather than letting an admin who
                adds many links push the whole dialog into scrolling. */}
            <div className="mt-2 max-h-32 space-y-3 overflow-y-auto px-1">
              {form.links.length === 0 && (
                <p className="font-body text-xs text-outline">No links.</p>
              )}
              {form.links.map((link, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      aria-label="Link label"
                      value={link.label}
                      onChange={(e) => setLink(index, { label: e.target.value })}
                      placeholder="Register"
                    />
                  </div>
                  <div className="flex-[2]">
                    <Input
                      aria-label="Link URL"
                      value={link.url}
                      onChange={(e) => setLink(index, { url: e.target.value })}
                      placeholder="https://…"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set("links", form.links.filter((_, i) => i !== index))}
                    aria-label="Remove link"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="font-body text-sm text-error">{error}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/* Fixed height (a "sweet spot", not viewport-covering) regardless of
          tab — grid-rows pins the header/footer and lets the middle row
          absorb all the size variation via its own scroll. */}
      <AnimatedDialogContent
        open={open}
        className="grid h-[640px] max-w-4xl grid-rows-[auto_1fr_auto] gap-4"
      >
        <DialogHeader>
          <DialogTitle>{announcement ? announcement.title : "Add announcement"}</DialogTitle>
        </DialogHeader>

        {announcement ? (
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
              <AnnouncementOverview a={announcement} />
            </TabsContent>
            <TabsContent value="edit" className="min-h-0 overflow-y-auto px-1">
              {editForm}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 overflow-y-auto px-1">{editForm}</div>
        )}

        <DialogFooter>
          {announcement && tab === "overview" ? (
            <>
              {announcement.status === "draft" && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy}
                  onClick={() => runTransition((id) => publishAnnouncement({ announcementId: id }))}
                >
                  Publish
                </Button>
              )}
              {announcement.status === "published" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy}
                    onClick={() => runTransition((id) => disableAnnouncement({ announcementId: id }))}
                  >
                    Disable
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy}
                    onClick={() => runTransition((id) => archiveAnnouncement({ announcementId: id }))}
                  >
                    Archive
                  </Button>
                </>
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
              {!announcement && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => handleSave("draft")}
                >
                  Save draft
                </Button>
              )}
              <Button
                size="sm"
                loading={busy}
                onClick={() => (announcement ? handleSave() : handleSave("published"))}
              >
                {announcement ? "Save" : "Publish"}
              </Button>
            </>
          )}
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
