"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Doc, type Id } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Field,
  ContentRow,
  errorMessage,
  formatDate,
  toDateInput,
  fromDateInput,
} from "./shared";

type Theme = Doc<"themes">;
type Scope = "annual" | "monthly";

interface FormState {
  scope: Scope;
  title: string;
  scriptureReference: string;
  scriptureText: string;
  coverImageUrl: string;
  periodStart: string;
  periodEnd: string;
}

const EMPTY: FormState = {
  scope: "annual",
  title: "",
  scriptureReference: "",
  scriptureText: "",
  coverImageUrl: "",
  periodStart: "",
  periodEnd: "",
};

function isCurrent(theme: Theme): boolean {
  const now = Date.now();
  return theme.periodStart <= now && now <= theme.periodEnd;
}

export function ThemesManager() {
  const themes = useAuthQuery(api.themes.listThemes, {});
  const createTheme = useMutation(api.themes.createTheme);
  const updateTheme = useMutation(api.themes.updateTheme);
  const deleteTheme = useMutation(api.themes.deleteTheme);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Theme | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Theme | null>(null);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function openEdit(theme: Theme) {
    setEditing(theme);
    setForm({
      scope: theme.scope,
      title: theme.title,
      scriptureReference: theme.scriptureReference,
      scriptureText: theme.scriptureText,
      coverImageUrl: theme.coverImageUrl ?? "",
      periodStart: toDateInput(theme.periodStart),
      periodEnd: toDateInput(theme.periodEnd),
    });
    setError(null);
    setOpen(true);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.title.trim() || !form.scriptureReference.trim() || !form.scriptureText.trim()) {
      setError("Title, scripture reference, and scripture text are required.");
      return;
    }
    if (!form.periodStart || !form.periodEnd) {
      setError("Both period start and end dates are required.");
      return;
    }
    const periodStart = fromDateInput(form.periodStart);
    const periodEnd = fromDateInput(form.periodEnd, true);
    if (periodEnd < periodStart) {
      setError("Period end must be on or after period start.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        scope: form.scope,
        title: form.title.trim(),
        scriptureReference: form.scriptureReference.trim(),
        scriptureText: form.scriptureText.trim(),
        coverImageUrl: form.coverImageUrl.trim() || undefined,
        periodStart,
        periodEnd,
      };
      if (editing) {
        await updateTheme({ themeId: editing._id as Id<"themes">, ...payload });
      } else {
        await createTheme(payload);
      }
      setOpen(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteTheme({ themeId: confirmDelete._id as Id<"themes"> });
      setConfirmDelete(null);
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
          Annual &amp; monthly themes. The current one is derived from its date window.
        </p>
        <Button size="sm" onClick={openNew}>
          New theme
        </Button>
      </div>

      {themes === undefined ? (
        <p className="font-body text-sm text-outline">Loading…</p>
      ) : themes.length === 0 ? (
        <EmptyState title="No themes yet" message="Add the annual and monthly themes members will see on the Home tab." />
      ) : (
        <div className="space-y-2">
          {themes.map((theme) => (
            <ContentRow
              key={theme._id}
              title={theme.title}
              meta={`${theme.scriptureReference} · ${formatDate(theme.periodStart)} – ${formatDate(theme.periodEnd)}`}
              badges={
                <>
                  <Badge variant="neutral">
                    {theme.scope === "annual" ? "Annual" : "Monthly"}
                  </Badge>
                  {isCurrent(theme) && <Badge variant="verified">Current</Badge>}
                </>
              }
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(theme)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(theme)}>
                    Delete
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={editing ? "Edit theme" : "New theme"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => !busy && setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={submit}>
              {editing ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Scope" htmlFor="theme-scope">
            <Select
              id="theme-scope"
              value={form.scope}
              onValueChange={(value) => set("scope", value as Scope)}
              options={[
                { value: "annual", label: "Annual" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </Field>
          <Field label="Title" htmlFor="theme-title">
            <Input id="theme-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="The Year of Kingdom Leadership" />
          </Field>
          <Field label="Scripture reference" htmlFor="theme-ref">
            <Input id="theme-ref" value={form.scriptureReference} onChange={(e) => set("scriptureReference", e.target.value)} placeholder="Matthew 16:19" />
          </Field>
          <Field label="Scripture text" htmlFor="theme-text">
            <Textarea id="theme-text" rows={4} value={form.scriptureText} onChange={(e) => set("scriptureText", e.target.value)} placeholder="And I will give unto thee the keys…" />
          </Field>
          <Field label="Cover image URL" htmlFor="theme-cover" hint="Paste an image URL (optional).">
            <Input id="theme-cover" value={form.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} placeholder="https://…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Period start" htmlFor="theme-start">
              <Input id="theme-start" type="date" value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
            </Field>
            <Field label="Period end" htmlFor="theme-end">
              <Input id="theme-end" type="date" value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
            </Field>
          </div>
          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>
      </Sheet>

      <Modal
        open={confirmDelete !== null}
        onClose={() => !busy && setConfirmDelete(null)}
        title="Delete theme?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => !busy && setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={doDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-on-surface-variant">
          “{confirmDelete?.title}” will be permanently removed. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
