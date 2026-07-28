"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/api";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
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
import { displayName, formatDate, roleLabel } from "@/lib/format";
import { AssignRoleSheet } from "./AssignRoleSheet";
import {
  CardHeading,
  errorMessage,
  type ActiveRoleAssignment,
  type UserDetail,
} from "./shared";

// Active + past role assignments with the module's canonical interaction
// split: assigning (non-destructive) opens a right Sheet; revoking
// (destructive) opens a centered confirm Modal.
export function RolesCard({
  detail,
  userId,
}: {
  detail: UserDetail;
  userId: Id<"users">;
}) {
  const revokeRole = useMutation(api.roles.revokeRole);

  const [assignOpen, setAssignOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ActiveRoleAssignment | null>(
    null,
  );
  const [revokeNote, setRevokeNote] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const targetName = displayName(detail.user);

  function closeRevoke() {
    if (revokeBusy) return;
    setRevokeTarget(null);
    setRevokeNote("");
    setRevokeError(null);
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    setRevokeError(null);
    try {
      const note = revokeNote.trim();
      await revokeRole({
        roleAssignmentId: revokeTarget._id,
        ...(note ? { note } : {}),
      });
      setRevokeTarget(null);
      setRevokeNote("");
    } catch (error) {
      setRevokeError(errorMessage(error));
    } finally {
      setRevokeBusy(false);
    }
  }

  const revokeTargetLabel = revokeTarget
    ? roleLabel(revokeTarget.roleType, revokeTarget.clanName)
    : "";

  return (
    <Card className="p-6">
      <CardHeading>Roles</CardHeading>

      {/* Active assignments */}
      {detail.activeRoles.length === 0 ? (
        <p className="mt-4 font-body text-sm text-on-surface-variant">
          No roles assigned.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {detail.activeRoles.map((assignment) => (
            <div
              key={assignment._id}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-body text-sm font-medium text-on-surface">
                  {roleLabel(assignment.roleType, assignment.clanName)}
                </p>
                <p className="font-body text-xs text-on-surface-variant">
                  Assigned by {displayName(assignment.assignedByUser)} &middot;{" "}
                  {formatDate(assignment._creationTime)}
                </p>
                {assignment.note && (
                  <p className="font-body text-xs italic text-outline">
                    Note: {assignment.note}
                  </p>
                )}
              </div>
              <ActionButton
                variant="danger"
                onClick={() => setRevokeTarget(assignment)}
              >
                Revoke
              </ActionButton>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        className="mt-5 w-full"
        onClick={() => setAssignOpen(true)}
      >
        Assign role
      </Button>

      {/* Past assignments — visually quiet disclosure */}
      {detail.pastRoles.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer list-none font-body text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface">
            Past roles ({detail.pastRoles.length})
          </summary>
          <div className="mt-3 space-y-3">
            {detail.pastRoles.map((assignment) => (
              <div key={assignment._id} className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-body text-sm text-on-surface-variant">
                  {roleLabel(assignment.roleType, assignment.clanName)}
                  <Badge variant="neutral">Revoked</Badge>
                </p>
                <p className="font-body text-xs text-outline">
                  Revoked by {displayName(assignment.revokedByUser)} &middot;{" "}
                  {assignment.revokedAt
                    ? formatDate(assignment.revokedAt)
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Non-destructive: assign via Sheet */}
      <AssignRoleSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        userId={userId}
        profileCompleted={detail.user.profileCompleted}
      />

      {/* Destructive: revoke via Dialog */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) closeRevoke();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Revoke ${revokeTargetLabel}?`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-body text-sm text-on-surface-variant">
              &lsquo;{revokeTargetLabel}&rsquo; will be removed from{" "}
              {targetName}. This is recorded in the activity log.
            </p>
            <Field label="Note (optional)" htmlFor="revoke-note">
              <Textarea
                id="revoke-note"
                value={revokeNote}
                onChange={(event) => setRevokeNote(event.target.value)}
                placeholder="Why is this role being revoked?"
              />
            </Field>
            {revokeError && (
              <p className="font-body text-sm text-error">{revokeError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={closeRevoke}>
              Cancel
            </Button>
            <ActionButton
              variant="danger"
              className="h-10 px-5"
              loading={revokeBusy}
              onClick={confirmRevoke}
            >
              Revoke role
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
