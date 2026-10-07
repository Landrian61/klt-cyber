"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { ActionButton } from "@/components/ui/ActionButton";
import { errorMessage } from "@/app/(admin)/admin/verification/shared";

/*
  Edit a roster member's position title.

  Shared by the Administration roster (/admin/roster) and the per-department
  roster (/admin/departments/[id]) so the "blank clears it" rule and the error
  handling live in one place.

  Authorization is the server's call: updateDepartmentMembership requires
  system_admin or that department's HOD. Following the convention already
  documented in RosterClient, the control renders for anyone who can see the
  roster and surfaces the real authorization error if they lack permission,
  rather than guessing at role state client-side.

  The draft is seeded from props, so callers must pass key={membership._id} to
  remount it when a different member is selected — otherwise the previous
  member's title would persist in the input.
*/
export function MembershipTitleEditor({
  membershipId,
  currentTitle,
  onSaved,
}: {
  membershipId: Id<"departmentMemberships">;
  currentTitle?: string;
  /** Called after a successful save (including a no-op save). */
  onSaved?: () => void;
}) {
  const updateMembership = useMutation(
    api.departmentMemberships.updateDepartmentMembership,
  );

  const [draft, setDraft] = useState(currentTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const dirty = trimmed !== (currentTitle ?? "");

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await updateMembership({
        membershipId,
        // Blank clears the title — the mutation treats "" and whitespace the
        // same as omitting it.
        ...(trimmed ? { positionTitle: trimmed } : {}),
      });
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field
        label="Position title"
        htmlFor="membership-position-title"
        error={error ?? undefined}
        hint="Leave blank to clear the title. Only this department's HOD (or a System Admin) can change it."
      >
        <Input
          id="membership-position-title"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="e.g. Head of Ushering"
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty && !busy) {
              event.preventDefault();
              void handleSave();
            }
          }}
        />
      </Field>

      <ActionButton
        variant="gold"
        onClick={handleSave}
        disabled={busy || !dirty}
      >
        {busy ? "Saving…" : "Save title"}
      </ActionButton>
    </div>
  );
}
