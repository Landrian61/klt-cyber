"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Doc, type Id } from "@/lib/api";
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
import { Badge, type BadgeVariant } from "@/components/shadcn/badge";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { DatePicker } from "@/components/ui/DatePicker";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import {
  CardGrid,
  ContentCard,
  Field,
  PriorityBadge,
  errorMessage,
} from "../_lib/adminContent";

type Announcement = Doc<"announcements">;
type Status = "draft" | "published" | "archived";
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

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  category: "",
  priority: "normal",
  coverImageUrl: "",
  links: [],
  startDate: undefined,
  endDate: undefined,
};

/** End-of-day snap for a period end, mirroring the old fromDateInput(v, true)
 * behaviour now that DatePicker hands back a local-midnight ms directly. */
function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const TAB_OPTIONS: { value: Status; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<Status, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "pending" },
  published: { label: "Published", variant: "verified" },
  archived: { label: "Archived", variant: "neutral" },
};

const EMPTY_COPY: Record<Status, { title: string; message: string }> = {
  draft: {
    title: "No draft announcements",
    message: "Announcements you're still writing land here.",
  },
  published: {
    title: "No published announcements",
    message: "Publish a draft to put it in front of the church.",
  },
  archived: {
    title: "No archived announcements",
    message: "Archived announcements stay here, still editable.",
  },
};

export function AnnouncementsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth — shareable, bookmarkable tab state.
  const tabParam = searchParams.get("tab");
  const tab: Status =
    tabParam === "published" || tabParam === "archived" ? tabParam : "draft";

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "draft") params.delete("tab");
      else params.set("tab", value);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const announcements = useAuthQuery(api.announcements.listAllAnnouncements, {});
  const createAnnouncement = useMutation(api.announcements.createAnnouncement);
  const updateAnnouncement = useMutation(api.announcements.updateAnnouncement);
  const publishAnnouncement = useMutation(api.announcements.publishAnnouncement);
  const archiveAnnouncement = useMutation(api.announcements.archiveAnnouncement);

  const filtered = useMemo(
    () => announcements?.filter((a) => a.status === tab),
    [announcements, tab],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllAnnouncements resolves coverImageUrl to a temporary signed URL
  // (resolveCoverUrls) for display — it is NOT the durable R2 key. Only send
  // coverImageUrl back to updateAnnouncement when the admin actually changed
  // it via ImageUpload; otherwise the signed preview URL would overwrite the
  // stored key and the image would 404 once the signature expires.
  const [coverImageTouched, setCoverImageTouched] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCoverImageTouched(false);
    setError(null);
    setOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({
      title: a.title,
      body: a.body,
      category: a.category ?? "",
      priority: a.priority ?? "normal",
      coverImageUrl: a.coverImageUrl ?? "",
      links: a.links ? a.links.map((l) => ({ ...l })) : [],
      startDate: a.startDate,
      endDate: a.endDate,
    });
    setCoverImageTouched(false);
    setError(null);
    setOpen(true);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
      if (editing) {
        await updateAnnouncement({
          announcementId: editing._id as Id<"announcements">,
          ...payload,
          // listAllAnnouncements resolves this to a temporary signed URL for
          // display — only resubmit it when the admin actually changed the
          // image, or we'd overwrite the durable R2 key with a signed URL
          // that expires.
          ...(coverImageTouched ? { coverImageUrl } : {}),
        });
      } else {
        // No pre-existing value to clobber on create — always include.
        await createAnnouncement({
          ...payload,
          coverImageUrl,
          status: publishStatus ?? "draft",
        });
      }
      setOpen(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  async function runTransition(fn: (id: Id<"announcements">) => Promise<unknown>) {
    if (!editing) return;
    setError(null);
    setBusy(true);
    try {
      await fn(editing._id as Id<"announcements">);
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
        <Heading as="h1" size="xl">
          Announcements
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Church-wide notices shown on the mobile app&rsquo;s updates feed.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          ariaLabel="Announcement status"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />
        <Button size="sm" onClick={openNew}>
          Add announcement
        </Button>
      </div>

      {!announcements ? (
        <CardGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-md" />
          ))}
        </CardGrid>
      ) : filtered && filtered.length > 0 ? (
        <CardGrid>
          {filtered.map((a) => (
            <ContentCard
              key={a._id}
              coverImageUrl={a.coverImageUrl}
              title={a.title}
              meta={a.category ?? "General"}
              badges={<PriorityBadge priority={a.priority} />}
              onClick={() => openEdit(a)}
            />
          ))}
        </CardGrid>
      ) : (
        <EmptyState
          title={EMPTY_COPY[tab].title}
          message={EMPTY_COPY[tab].message}
        />
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) setOpen(false);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 pr-6">
              <DialogTitle>
                {editing ? "Edit announcement" : "New announcement"}
              </DialogTitle>
              {editing && (
                <Badge variant={STATUS_BADGE[editing.status].variant}>
                  {STATUS_BADGE[editing.status].label}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <Field label="Title" htmlFor="ann-title" className="md:col-span-2">
              <Input
                id="ann-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Water Baptism this Saturday"
              />
            </Field>

            <div className="space-y-5">
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
                <Field label="Category" htmlFor="ann-cat">
                  <Input
                    id="ann-cat"
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
                  <span className="font-body text-sm font-medium text-on-surface-variant">
                    Links
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set("links", [...form.links, { label: "", url: "" }])}
                  >
                    Add link
                  </Button>
                </div>
                {/* The one genuinely unbounded field in this form — capped
                    with its own small scroll region rather than letting an
                    admin who adds many links push the whole dialog into
                    scrolling. */}
                <div className="mt-2 max-h-40 space-y-3 overflow-y-auto pr-1">
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

            {error && (
              <p className="font-body text-sm text-error md:col-span-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {!editing && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => handleSave("draft")}
                >
                  Save draft
                </Button>
                <Button size="sm" loading={busy} onClick={() => handleSave("published")}>
                  Publish
                </Button>
              </>
            )}
            {editing && editing.status === "draft" && (
              <>
                <Button variant="secondary" size="sm" loading={busy} onClick={() => handleSave()}>
                  Save
                </Button>
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() => runTransition((id) => publishAnnouncement({ announcementId: id }))}
                >
                  Publish
                </Button>
              </>
            )}
            {editing && editing.status === "published" && (
              <>
                <Button variant="secondary" size="sm" loading={busy} onClick={() => handleSave()}>
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => runTransition((id) => archiveAnnouncement({ announcementId: id }))}
                >
                  Archive
                </Button>
              </>
            )}
            {editing && editing.status === "archived" && (
              <Button size="sm" loading={busy} onClick={() => handleSave()}>
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
