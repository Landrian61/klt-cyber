"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CLAIM_DECLINE_REASON_MAX_LENGTH } from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { ActionButton } from "@/components/ui/ActionButton";
import { Textarea } from "@/components/shadcn/textarea";
import { Dialog, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";

/**
 * Decline someone's request to serve here (spec 0012, AC-17).
 *
 * The reason is optional but worth offering: it is the one thing the person
 * receives with the decision, and "not this time" with a sentence behind it is
 * a different message from silence. It reaches only them and this department's
 * head.
 */
export function DeclineClaimDialog({
  membershipId,
  memberName,
  onClose,
}: {
  membershipId: Id<"departmentMemberships">;
  memberName: string;
  onClose: () => void;
}) {
  const declineClaim = useMutation(api.departmentMemberships.declineClaim);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecline() {
    setError(null);
    setSaving(true);
    try {
      await declineClaim({
        membershipId,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onClose();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  const remaining = CLAIM_DECLINE_REASON_MAX_LENGTH - reason.length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <AnimatedDialogContent open className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline this request</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-1">
          <p className="font-body text-sm text-on-surface-variant">
            {memberName} will be told their request to serve here was not taken
            up. They can ask again later.
          </p>

          <Field
            label="Reason (optional)"
            htmlFor="decline-reason"
            hint={`Only ${memberName.split(" ")[0]} and you will read this. ${remaining} characters left.`}
          >
            <Textarea
              id="decline-reason"
              rows={3}
              value={reason}
              maxLength={CLAIM_DECLINE_REASON_MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. We are full this term — do ask again in the new year."
            />
          </Field>

          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <ActionButton variant="neutral" onClick={onClose}>
              Cancel
            </ActionButton>
            <ActionButton
              variant="danger"
              loading={saving}
              onClick={handleDecline}
            >
              Decline
            </ActionButton>
          </div>
        </div>
      </AnimatedDialogContent>
    </Dialog>
  );
}
