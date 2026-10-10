"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import {
  parseYouTubeVideoId,
  pastEventInputSchema,
  youtubeThumbnailUrl,
} from "@klt-cyber/shared";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Field,
  errorMessage,
  fromDateInput,
  toDateInput,
} from "../_lib/adminContent";
import { usePastEventActions, type PastEvent } from "../_lib/mediaContentData";

interface FormState {
  title: string;
  date: number | undefined;
  youtubeUrl: string;
}

const EMPTY_FORM: FormState = { title: "", date: undefined, youtubeUrl: "" };

function formFromPastEvent(e: PastEvent): FormState {
  return {
    title: e.title,
    date: fromDateInput(e.date),
    youtubeUrl: e.youtubeUrl,
  };
}

export function PastEventDialog({
  open,
  onOpenChange,
  pastEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pastEvent: PastEvent | null;
}) {
  const { create, update, remove } = usePastEventActions();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmingDelete(false);
    setForm(pastEvent ? formFromPastEvent(pastEvent) : EMPTY_FORM);
  }, [open, pastEvent]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Live preview: re-derived on every keystroke from the pasted link.
  const videoId = parseYouTubeVideoId(form.youtubeUrl);

  function buildPayload() {
    if (form.date === undefined || Number.isNaN(form.date)) {
      throw new Error("Pick a date.");
    }
    const parsed = pastEventInputSchema.safeParse({
      title: form.title,
      date: toDateInput(form.date),
      youtubeUrl: form.youtubeUrl,
    });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Check the form and try again.",
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
      if (pastEvent) {
        await update(pastEvent._id, payload);
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
    if (!pastEvent) return;
    setError(null);
    setBusy(true);
    try {
      await remove(pastEvent._id);
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
        className="grid max-h-[90dvh] max-w-3xl grid-rows-[auto_1fr_auto] gap-4"
      >
        <DialogHeader>
          <DialogTitle>
            {pastEvent ? "Edit past event" : "Add past event"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto px-1 sm:grid-cols-2">
          <div className="space-y-5">
            <Field label="Title" htmlFor="pe-title">
              <Input
                id="pe-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Easter Sunday Service"
              />
            </Field>
            <Field label="Event date" htmlFor="pe-date">
              <DatePicker
                id="pe-date"
                value={form.date}
                onChange={(value) => set("date", value)}
              />
            </Field>
            <Field
              label="YouTube link"
              htmlFor="pe-url"
              hint="Paste a watch, youtu.be, embed or shorts link."
            >
              <Input
                id="pe-url"
                value={form.youtubeUrl}
                onChange={(e) => set("youtubeUrl", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </Field>
          </div>

          <div>
            <span className="font-body text-sm font-medium text-on-surface-variant">
              Thumbnail preview
            </span>
            <div className="mt-2 overflow-hidden rounded-md bg-surface-low">
              {videoId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={youtubeThumbnailUrl(videoId)}
                  alt="Thumbnail preview"
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 text-outline">
                  <ImageOff className="h-6 w-6" />
                  <span className="font-body text-sm">
                    {form.youtubeUrl.trim()
                      ? "Not a YouTube video link"
                      : "Paste a link to preview"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="font-body text-sm text-error sm:col-span-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {pastEvent && !confirmingDelete && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Remove
            </Button>
          )}
          {confirmingDelete ? (
            <>
              <p className="mr-auto self-center font-body text-sm text-on-surface-variant">
                Remove this event from the archive?
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
                Yes, remove
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
                {pastEvent ? "Save" : "Add event"}
              </Button>
            </>
          )}
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
