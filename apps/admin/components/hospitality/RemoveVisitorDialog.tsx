"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";

import { api, type Id } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { hospitalityError } from "./hospitalityErrors";

const CONFIRM_WORD = "REMOVE";

/**
 * Remove a walk in on request (spec 0024, AC-25), behind a typed
 * confirmation. The server checks the word too, so this is not the guard.
 */
export function RemoveVisitorDialog({
  visitorId,
  name,
  open,
  onOpenChange,
  onRemoved,
}: {
  visitorId: Id<"visitors">;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const removeWalkIn = useMutation(api.hospitality.removeWalkIn);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setError(null);
    }
  }, [open]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await removeWalkIn({ visitorId, confirm: typed.trim() });
      onRemoved();
    } catch (caught) {
      setError(hospitalityError(caught));
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their name, phone, notes and every contact note are deleted for good,
            and any open follow up closes. Only the visit dates stay, unnamed, so
            the church’s visitor totals remain true. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field label={`Type ${CONFIRM_WORD} to confirm`} htmlFor="remove-confirm">
          <Input
            id="remove-confirm"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
        {error && <p className="font-body text-sm text-error">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep visitor</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={busy}
            disabled={busy || typed.trim() !== CONFIRM_WORD}
            onClick={remove}
          >
            Remove visitor
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
