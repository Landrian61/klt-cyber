"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Search } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Avatar } from "@/components/shadcn/avatar";
import { Input } from "@/components/shadcn/input";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Dialog, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";

/**
 * Add a verified member to this roster (spec 0012, AC-19).
 *
 * A lookup rather than a list: the picker asks for a name before it shows
 * anybody, because a department head has no business browsing the whole church
 * directory to find one person. Anyone already serving here or already waiting
 * on a decision is filtered out server side, so the list cannot offer a
 * duplicate.
 */
export function AddMemberDialog({
  departmentId,
  onClose,
}: {
  departmentId: Id<"departments">;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{
    userId: Id<"users">;
    displayName: string;
  } | null>(null);
  const [positionTitle, setPositionTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useAuthQuery(
    api.departmentMemberships.listAddableMembers,
    { departmentId, search },
  );

  const addMember = useMutation(api.departmentMemberships.addDepartmentMember);

  async function handleAdd() {
    if (!picked) return;
    setError(null);
    setSaving(true);
    try {
      await addMember({
        departmentId,
        userId: picked.userId,
        ...(positionTitle.trim() ? { positionTitle: positionTitle.trim() } : {}),
      });
      onClose();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  const searching = search.trim().length >= 2;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <AnimatedDialogContent open className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-1">
          <Field
            label="Who are you adding?"
            hint="Only verified members can be added. Type at least two letters of their name."
          >
            <SearchInput
              defaultValue={search}
              onDebouncedChange={(value) => {
                setSearch(value);
                setPicked(null);
              }}
              placeholder="Search verified members…"
            />
          </Field>

          {!searching ? (
            <p className="flex items-center gap-2 font-body text-sm text-outline">
              <Search className="size-4" aria-hidden="true" />
              Start typing a name to find them.
            </p>
          ) : candidates === undefined ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : candidates === null ? (
            <p className="font-body text-sm text-error">
              You are not able to add members to this department.
            </p>
          ) : candidates.length === 0 ? (
            <EmptyState
              title="Nobody matches that"
              message="They may not be verified yet, or they may already be on this roster."
            />
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {candidates.map((candidate) => {
                const chosen = picked?.userId === candidate.userId;
                return (
                  <li key={candidate.userId}>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked({
                          userId: candidate.userId,
                          displayName: candidate.displayName,
                        })
                      }
                      aria-pressed={chosen}
                      className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                        chosen
                          ? "border-primary/50 bg-primary-light"
                          : "border-border bg-surface-lowest hover:bg-surface-low"
                      }`}
                    >
                      <Avatar
                        name={candidate.displayName}
                        src={candidate.photoUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-body text-sm font-semibold text-on-surface">
                          {candidate.displayName}
                        </span>
                        <span className="block truncate font-body text-xs text-on-surface-variant">
                          {candidate.clanName ?? "No clan yet"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {picked && (
            <Field
              label="Position (optional)"
              htmlFor="add-member-position"
              hint="What they will be doing here. You can set this later."
            >
              <Input
                id="add-member-position"
                value={positionTitle}
                maxLength={80}
                onChange={(event) => setPositionTitle(event.target.value)}
                placeholder="e.g. Camera operator"
              />
            </Field>
          )}

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
              variant="gold"
              disabled={!picked}
              loading={saving}
              onClick={handleAdd}
            >
              {picked ? `Add ${picked.displayName.split(" ")[0]}` : "Add"}
            </ActionButton>
          </div>
        </div>
      </AnimatedDialogContent>
    </Dialog>
  );
}
