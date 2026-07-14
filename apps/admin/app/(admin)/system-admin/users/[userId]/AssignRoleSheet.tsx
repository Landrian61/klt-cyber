"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { roleAssignmentInputSchema } from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage } from "./shared";

type RoleChoice = "" | "system_admin" | "clan_elder";

// Assigning a role is additive, not destructive — so it lives in the right
// Sheet (module canon). The payload is the discriminated union from
// @klt-cyber/shared: clan_elder carries a clanId, system_admin must not.
export function AssignRoleSheet({
  open,
  onClose,
  userId,
  profileCompleted,
}: {
  open: boolean;
  onClose: () => void;
  userId: Id<"users">;
  profileCompleted: boolean;
}) {
  const assignRole = useMutation(api.roles.assignRole);
  const clans = useAuthQuery(api.clans.listClans, {});

  const [roleType, setRoleType] = useState<RoleChoice>("");
  const [clanId, setClanId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenClanName =
    roleType === "clan_elder" && clanId
      ? (clans?.find((clan) => clan._id === clanId)?.name ?? null)
      : null;

  function reset() {
    setRoleType("");
    setClanId("");
    setNote("");
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);

    if (!roleType) {
      setError("Choose a role to assign.");
      return;
    }
    const trimmedNote = note.trim();
    const candidate =
      roleType === "clan_elder"
        ? {
            roleType,
            userId: userId as string,
            clanId,
            ...(trimmedNote ? { note: trimmedNote } : {}),
          }
        : {
            roleType,
            userId: userId as string,
            ...(trimmedNote ? { note: trimmedNote } : {}),
          };
    const parsed = roleAssignmentInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        roleType === "clan_elder" && !clanId
          ? "Choose a clan for the elder role."
          : "Please review the form and try again.",
      );
      return;
    }

    setBusy(true);
    try {
      if (roleType === "clan_elder") {
        await assignRole({
          roleType,
          userId,
          clanId: clanId as Id<"clans">,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        });
      } else {
        await assignRole({
          roleType,
          userId,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        });
      }
      reset();
      onClose();
    } catch (mutationError) {
      // Server rejections (incomplete profile, race conditions) stay inline —
      // the sheet remains open so the admin can adjust.
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Assign a role"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          {profileCompleted && (
            <Button size="sm" loading={busy} onClick={handleSubmit}>
              Assign role
            </Button>
          )}
        </>
      }
    >
      {profileCompleted ? (
        <div className="space-y-6">
          <div>
            <Label htmlFor="assign-role-type">Role</Label>
            <Select
              id="assign-role-type"
              value={roleType}
              onValueChange={(value) => {
                setRoleType(value as RoleChoice);
                setError(null);
              }}
              placeholder="Choose a role…"
              options={[
                { value: "system_admin", label: "System Administrator" },
                { value: "clan_elder", label: "Clan Elder" },
              ]}
            />
          </div>

          {roleType === "clan_elder" && (
            <div>
              <Label htmlFor="assign-clan">Clan</Label>
              <Select
                id="assign-clan"
                value={clanId}
                onValueChange={(value) => {
                  setClanId(value);
                  setError(null);
                }}
                placeholder="Choose a clan…"
                options={(clans ?? []).map((clan) => ({
                  value: clan._id,
                  label: clan.name,
                }))}
              />
            </div>
          )}

          <div>
            <Label htmlFor="assign-note">Note (optional)</Label>
            <Textarea
              id="assign-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Context for the audit trail"
            />
          </div>

          {chosenClanName && (
            <p className="rounded-md bg-warning-light p-3 font-body text-xs text-on-surface-variant">
              If Clan {chosenClanName} already has an elder, they will be
              replaced and their assignment revoked.
            </p>
          )}

          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>
      ) : (
        <div className="rounded-md bg-surface-low p-4 font-body text-sm text-on-surface-variant">
          This user must complete their member profile before roles can be
          assigned.
        </div>
      )}
    </Sheet>
  );
}
