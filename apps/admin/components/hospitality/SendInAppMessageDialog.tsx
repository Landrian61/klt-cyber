"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { IN_APP_MESSAGE_MAX } from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Field } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/ui/Button";
import { hospitalityError } from "./hospitalityErrors";

/**
 * An in app message to the chosen app visitors (spec 0024, AC-21, N41).
 *
 * It arrives as a push and in their notification list. All or nothing: if
 * anyone chosen can no longer receive it, the server refuses the whole send
 * and nothing is logged, so the operator refreshes and tries again.
 */
export function SendInAppMessageDialog({
  open,
  onOpenChange,
  visitorIds,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitorIds: Id<"visitors">[];
  onSent: () => void;
}) {
  const send = useMutation(api.hospitality.sendInAppMessage);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBody("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!body.trim()) {
      setError("Write the message first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send({ visitorIds, body: body.trim() });
      onSent();
      onOpenChange(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  const count = visitorIds.length;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Message <span className="font-mono">{count}</span> app{" "}
            {count === 1 ? "visitor" : "visitors"}
          </DialogTitle>
          <DialogDescription>
            They get it as a notification in the KLT app, from Kingdom Life
            Tabernacle. It is logged on each of their records.
          </DialogDescription>
        </DialogHeader>
        <Field
          label="Message"
          htmlFor="in-app-body"
          hint={`${body.trim().length} of ${IN_APP_MESSAGE_MAX} characters.`}
        >
          <Textarea
            id="in-app-body"
            rows={5}
            maxLength={IN_APP_MESSAGE_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
            {error}
          </p>
        )}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" loading={busy} disabled={busy} onClick={submit}>
            Send message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
