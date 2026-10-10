"use client";

import { useEffect, useState } from "react";
import { devotionalInputSchema } from "@klt-cyber/shared";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Field,
  errorMessage,
  formatDate,
  fromDateInput,
  toDateInput,
} from "../_lib/adminContent";
import {
  useDevotionalActions,
  type Devotional,
} from "../_lib/mediaContentData";

interface FormState {
  title: string;
  scriptureReference: string;
  body: string;
  date: number | undefined;
}

function emptyForm(defaultDate?: string): FormState {
  return {
    title: "",
    scriptureReference: "",
    body: "",
    date: defaultDate ? fromDateInput(defaultDate) : undefined,
  };
}

function formFromDevotional(d: Devotional): FormState {
  return {
    title: d.title,
    scriptureReference: d.scriptureReference,
    body: d.body,
    date: fromDateInput(d.date),
  };
}

export function DevotionalDialog({
  open,
  onOpenChange,
  devotional,
  defaultDate,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devotional: Devotional | null;
  defaultDate?: string;
  existing: Devotional[];
}) {
  const { create, update, remove } = useDevotionalActions();

  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The Dialog stays mounted between opens — re-seed each time it opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmingDelete(false);
    setForm(
      devotional ? formFromDevotional(devotional) : emptyForm(defaultDate),
    );
  }, [open, devotional, defaultDate]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    if (form.date === undefined || Number.isNaN(form.date)) {
      throw new Error("Pick a date.");
    }
    const parsed = devotionalInputSchema.safeParse({
      title: form.title,
      scriptureReference: form.scriptureReference,
      body: form.body,
      date: toDateInput(form.date),
    });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Check the form and try again.",
      );
    }
    const clash = existing.find(
      (d) => d.date === parsed.data.date && d._id !== devotional?._id,
    );
    if (clash) {
      throw new Error(
        `A devotional already exists for ${formatDate(fromDateInput(clash.date))}: “${clash.title}”.`,
      );
    }
    return parsed.data;
  }

  async function handleSave() {
    setError(null);
    let payload;
    try {
      payload = buildPayload();
    } catch (validationError) {
      setError(errorMessage(validationError));
      return;
    }
    setBusy(true);
    try {
      if (devotional) {
        await update(devotional._id, payload);
      } else {
        await create(payload);
      }
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!devotional) return;
    setError(null);
    setBusy(true);
    try {
      await remove(devotional._id);
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AnimatedDialogContent
        open={open}
        className="grid max-h-[90dvh] max-w-2xl grid-rows-[auto_1fr_auto] gap-4"
      >
        <DialogHeader>
          <DialogTitle>
            {devotional ? "Edit devotional" : "Add devotional"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-1">
          <Field
            label="Date"
            htmlFor="dev-date"
            hint="One devotional per date. Future dates stay hidden from members until the day."
          >
            <DatePicker
              id="dev-date"
              value={form.date}
              onChange={(value) => set("date", value)}
            />
          </Field>
          <Field label="Title" htmlFor="dev-title">
            <Input
              id="dev-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Walking in faith"
            />
          </Field>
          <Field label="Scripture reference" htmlFor="dev-scripture">
            <Input
              id="dev-scripture"
              value={form.scriptureReference}
              onChange={(e) => set("scriptureReference", e.target.value)}
              placeholder="Hebrews 11:1"
            />
          </Field>
          <Field label="Devotional text" htmlFor="dev-body">
            <Textarea
              id="dev-body"
              rows={10}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Write the devotional…"
            />
          </Field>

          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>

        <DialogFooter>
          {devotional && !confirmingDelete && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
          {confirmingDelete ? (
            <>
              <p className="mr-auto self-center font-body text-sm text-on-surface-variant">
                Delete this devotional? This can&rsquo;t be undone.
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button size="sm" loading={busy} onClick={handleDelete}>
                Yes, delete
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => !busy && onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button size="sm" loading={busy} onClick={handleSave}>
                {devotional ? "Save" : "Add devotional"}
              </Button>
            </>
          )}
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
