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
import { Badge, type BadgeVariant } from "@/components/shadcn/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Field,
  CheckboxField,
  ContentRow,
  errorMessage,
  formatDate,
  toDateInput,
  fromDateInput,
} from "./shared";

type Announcement = Doc<"announcements">;
type Priority = "low" | "normal" | "high";
type LinkRow = { label: string; url: string };

interface FormState {
  title: string;
  body: string;
  category: string;
  priority: Priority;
  coverImageUrl: string;
  links: LinkRow[];
  startDate: string;
  endDate: string;
  publishNow: boolean;
}

const EMPTY: FormState = {
  title: "",
  body: "",
  category: "",
  priority: "normal",
  coverImageUrl: "",
  links: [],
  startDate: "",
  endDate: "",
  publishNow: true,
};

/** Derived lifecycle label from stored status + date window (spec §10.8). */
function lifecycle(a: Announcement): { label: string; variant: BadgeVariant } {
  const now = Date.now();
  if (a.status === "archived") return { label: "Archived", variant: "neutral" };
  if (a.status === "draft") return { label: "Draft", variant: "pending" };
  if (now < a.startDate) return { label: "Scheduled", variant: "member" };
  if (now > a.endDate) return { label: "Expired", variant: "neutral" };
  return { label: "Active", variant: "verified" };
}

export function AnnouncementsManager() {
  const announcements = useAuthQuery(api.announcements.listAllAnnouncements, {});
  const createAnnouncement = useMutation(api.announcements.createAnnouncement);
  const updateAnnouncement = useMutation(api.announcements.updateAnnouncement);
  const publish = useMutation(api.announcements.publishAnnouncement);
  const disable = useMutation(api.announcements.disableAnnouncement);
  const archive = useMutation(api.announcements.archiveAnnouncement);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // listAllAnnouncements resolves coverImageUrl to a temporary signed URL
  // (7-day expiry), not the durable R2 key — see convex/lib/media.ts. Track
  // whether the admin actually touched the image so an untouched save omits
  // the field from the update payload rather than overwriting the stored key
  // with a URL that will 404 once it expires.
  const [coverImageTouched, setCoverImageTouched] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setCoverImageTouched(false);
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
      startDate: toDateInput(a.startDate),
      endDate: toDateInput(a.endDate),
      publishNow: false, // edit never changes status; use the row actions
    });
    setError(null);
    setCoverImageTouched(false);
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

  async function submit() {
    setError(null);
    if (!form.title.trim() || !form.body.trim()) {
      setError("Title and body are required.");
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError("Start and end dates are required.");
      return;
    }
    const startDate = fromDateInput(form.startDate);
    const endDate = fromDateInput(form.endDate, true);
    if (endDate < startDate) {
      setError("End date must be on or after start date.");
      return;
    }
    const links = form.links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url);

    setBusy(true);
    try {
      const shared = {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category.trim() || undefined,
        priority: form.priority,
        links: links.length ? links : undefined,
        startDate,
        endDate,
      };
      if (editing) {
        // coverImageUrl from the query is a temporary signed URL (7-day
        // expiry), not the durable R2 key — only send it back when the admin
        // actually replaced/removed the image. Omitting the key leaves the
        // stored value untouched (see convex/announcements.ts).
        await updateAnnouncement({
          announcementId: editing._id as Id<"announcements">,
          ...shared,
          ...(coverImageTouched
            ? { coverImageUrl: form.coverImageUrl.trim() || undefined }
            : {}),
        });
      } else {
        await createAnnouncement({
          ...shared,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
          status: form.publishNow ? "published" : "draft",
        });
      }
      setOpen(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch {
      // Reactive list reflects the true state; a failed transition self-corrects.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-on-surface-variant">
          Only published announcements within their date window reach members.
        </p>
        <Button size="sm" onClick={openNew}>
          New announcement
        </Button>
      </div>

      {!announcements ? (
        <p className="font-body text-sm text-outline">Loading…</p>
      ) : announcements.length === 0 ? (
        <EmptyState title="No announcements yet" message="Post the church's weekly notices here." />
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => {
            const state = lifecycle(a);
            return (
              <ContentRow
                key={a._id}
                title={a.title}
                meta={`${formatDate(a.startDate)} – ${formatDate(a.endDate)}${a.priority ? ` · ${a.priority} priority` : ""}`}
                badges={<Badge variant={state.variant}>{state.label}</Badge>}
                actions={
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      Edit
                    </Button>
                    {a.status !== "published" && (
                      <Button variant="ghost" size="sm" onClick={() => runAction(() => publish({ announcementId: a._id as Id<"announcements"> }))}>
                        Publish
                      </Button>
                    )}
                    {a.status === "published" && (
                      <Button variant="ghost" size="sm" onClick={() => runAction(() => disable({ announcementId: a._id as Id<"announcements"> }))}>
                        Disable
                      </Button>
                    )}
                    {a.status !== "archived" && (
                      <Button variant="ghost" size="sm" onClick={() => runAction(() => archive({ announcementId: a._id as Id<"announcements"> }))}>
                        Archive
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
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
            <SheetTitle>
              {editing ? "Edit announcement" : "New announcement"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-5 flex-1 overflow-y-auto">
            <div className="space-y-5">
          <Field label="Title" htmlFor="ann-title">
            <Input id="ann-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Water Baptism this Saturday" />
          </Field>
          <Field label="Body" htmlFor="ann-body">
            <Textarea id="ann-body" rows={5} value={form.body} onChange={(e) => set("body", e.target.value)} placeholder="Full announcement text…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" htmlFor="ann-cat">
              <Input id="ann-cat" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="event (optional)" />
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

          <div>
            <div className="flex items-center justify-between">
              <span className="font-body text-sm font-medium text-on-surface-variant">Links</span>
              <Button variant="ghost" size="sm" onClick={() => set("links", [...form.links, { label: "", url: "" }])}>
                Add link
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {form.links.length === 0 && (
                <p className="font-body text-xs text-outline">No links.</p>
              )}
              {form.links.map((link, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input aria-label="Link label" value={link.label} onChange={(e) => setLink(index, { label: e.target.value })} placeholder="Register" />
                  </div>
                  <div className="flex-[2]">
                    <Input aria-label="Link URL" value={link.url} onChange={(e) => setLink(index, { url: e.target.value })} placeholder="https://…" />
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" htmlFor="ann-start">
              <Input id="ann-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="End date" htmlFor="ann-end">
              <Input id="ann-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
          </div>

          {!editing && (
            <CheckboxField id="ann-publish" label="Publish immediately" checked={form.publishNow} onChange={(value) => set("publishNow", value)} />
          )}
          {editing && (
            <p className="font-body text-xs text-outline">
              Use the Publish / Disable / Archive actions on the list to change status.
            </p>
          )}
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
