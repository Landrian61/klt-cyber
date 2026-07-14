"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { Sheet } from "@/components/ui/Sheet";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { displayName } from "@/lib/format";
import { CardHeading, errorMessage, type UserDetail } from "./shared";

// Shown only while a self-selected clan claim awaits verification (the parent
// gates rendering). Verify is non-destructive → Sheet; reject is destructive
// → Modal.
export function ClanAffiliationCard({
  detail,
  userId,
}: {
  detail: UserDetail;
  userId: Id<"users">;
}) {
  const verifyClanAffiliation = useMutation(api.admin.verifyClanAffiliation);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = displayName(detail.user);
  const clanName = detail.profile?.clanName ?? "—";

  function closeAll() {
    if (busy) return;
    setVerifyOpen(false);
    setRejectOpen(false);
    setNote("");
    setError(null);
  }

  async function submit(status: "verified" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      await verifyClanAffiliation({
        userId,
        status,
        ...(trimmed ? { note: trimmed } : {}),
      });
      setVerifyOpen(false);
      setRejectOpen(false);
      setNote("");
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeading>Clan affiliation</CardHeading>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="font-body text-sm font-medium text-on-surface">
          Claimed: Clan {clanName}
        </p>
        <Badge variant="pending">Pending</Badge>
      </div>
      <p className="mt-2 font-body text-xs text-on-surface-variant">
        Self-selected at profile completion &mdash; awaiting verification.
      </p>

      <div className="mt-4 flex gap-2">
        <ActionButton variant="gold" onClick={() => setVerifyOpen(true)}>
          Verify
        </ActionButton>
        <ActionButton variant="danger" onClick={() => setRejectOpen(true)}>
          Reject
        </ActionButton>
      </div>

      {/* Non-destructive: verify via Sheet */}
      <Sheet
        open={verifyOpen}
        onClose={closeAll}
        title="Verify clan affiliation"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeAll}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={() => submit("verified")}>
              Verify
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <p className="font-body text-sm text-on-surface-variant">
            Confirm {name} as a member of Clan {clanName}.
          </p>
          <div>
            <Label htmlFor="verify-note">Note (optional)</Label>
            <Textarea
              id="verify-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Context for the audit trail"
            />
          </div>
          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>
      </Sheet>

      {/* Destructive: reject via Modal */}
      <Modal
        open={rejectOpen}
        onClose={closeAll}
        title="Reject clan affiliation?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeAll}>
              Cancel
            </Button>
            <ActionButton
              variant="danger"
              className="h-10 px-5"
              loading={busy}
              onClick={() => submit("rejected")}
            >
              Reject affiliation
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <p className="font-body text-sm text-on-surface-variant">
            {name}&apos;s claim to Clan {clanName} will be marked as rejected.
            This is recorded in the activity log.
          </p>
          <div>
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why is this claim being rejected?"
            />
          </div>
          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>
      </Modal>
    </Card>
  );
}
