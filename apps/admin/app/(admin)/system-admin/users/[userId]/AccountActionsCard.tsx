"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/api";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Field } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import { displayName } from "@/lib/format";
import { CardHeading, errorMessage, type UserDetail } from "./shared";

// Suspend / reactivate — both state changes are confirmed in a centered Modal
// (suspension is the module's destructive canon; reactivation mirrors it for
// symmetry, with a gold confirm).
export function AccountActionsCard({
  detail,
  userId,
}: {
  detail: UserDetail;
  userId: Id<"users">;
}) {
  const suspendUser = useMutation(api.admin.suspendUser);
  const unsuspendUser = useMutation(api.admin.unsuspendUser);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspended = detail.user.status === "suspended";
  const name = displayName(detail.user);

  function close() {
    if (busy) return;
    setConfirmOpen(false);
    setNote("");
    setError(null);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (suspended) {
        await unsuspendUser({ userId });
      } else {
        const trimmed = note.trim();
        await suspendUser({ userId, ...(trimmed ? { note: trimmed } : {}) });
      }
      setConfirmOpen(false);
      setNote("");
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <CardHeading>Account actions</CardHeading>

      <div className="mt-4">
        {suspended ? (
          <ActionButton variant="gold" onClick={() => setConfirmOpen(true)}>
            Reactivate account
          </ActionButton>
        ) : (
          <ActionButton variant="danger" onClick={() => setConfirmOpen(true)}>
            Suspend account
          </ActionButton>
        )}
        <p className="mt-2 font-body text-xs text-on-surface-variant">
          {suspended
            ? "Reactivating restores sign-in access immediately."
            : "Suspension keeps all records but blocks sign-in until the account is reactivated."}
        </p>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {suspended ? `Reactivate ${name}?` : `Suspend ${name}?`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {suspended ? (
              <p className="font-body text-sm text-on-surface-variant">
                {name} will be able to sign in again immediately. This is
                recorded in the activity log.
              </p>
            ) : (
              <>
                <p className="font-body text-sm text-on-surface-variant">
                  {name} will no longer be able to sign in. Their profile and
                  records are kept, and the account can be reactivated at any
                  time. This is recorded in the activity log.
                </p>
                <Field label="Reason (optional)" htmlFor="suspend-note">
                  <Textarea
                    id="suspend-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why is this account being suspended?"
                  />
                </Field>
              </>
            )}
            {error && <p className="font-body text-sm text-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <ActionButton
              variant={suspended ? "gold" : "danger"}
              className="h-10 px-5"
              loading={busy}
              onClick={confirm}
            >
              {suspended ? "Reactivate" : "Suspend"}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
