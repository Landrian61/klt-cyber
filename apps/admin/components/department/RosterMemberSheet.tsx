"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { ActionButton } from "@/components/ui/ActionButton";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import type { DepartmentShellContext } from "./DepartmentShellProvider";

/**
 * How long a position title may be in the form.
 *
 * `positionTitle` carries no server-side cap — it is free text a department
 * names its own roles with, and the SRS sets no limit. This is a form courtesy
 * so a pasted paragraph does not land in a table cell, not a contract, which is
 * why it is local rather than a shared constant.
 */
const POSITION_INPUT_MAX = 80;

/**
 * One roster member, in full (spec 0012, AC-11, AC-20).
 *
 * The profile shown here comes from `getRosterMemberProfile`, the single named
 * function that bypasses a member's directory sharing setting. That carve-out
 * exists so an HOD can actually reach the people serving with them (S3-02), and
 * it is deliberately narrow: this sheet only opens for a caller the server
 * agreed holds `viewFullProfiles` in this department.
 */

type Roster = NonNullable<
  FunctionReturnType<typeof api.departmentMemberships.listRosterWithClaims>
>;

export function RosterMemberSheet({
  departmentId,
  row: snapshot,
  can,
  onClose,
}: {
  departmentId: Id<"departments">;
  row: Roster["active"][number];
  can: DepartmentShellContext["can"];
  onClose: () => void;
}) {
  // The row the parent handed over is the snapshot from the click, and the
  // sheet does not remount while it is open. Reading the live row back out of
  // the roster keeps the controls honest: without it, appointing a delegate
  // leaves the button still reading "Make a delegate", and a saved position
  // title never shows up, until the HOD closes the sheet and opens it again.
  //
  // This is the same query the roster page already has mounted, so Convex
  // serves it from the one subscription rather than opening a second.
  const roster = useAuthQuery(
    api.departmentMemberships.listRosterWithClaims,
    { departmentId },
  );
  const row =
    roster?.active.find((m) => m.membershipId === snapshot.membershipId) ??
    snapshot;

  const detail = useAuthQuery(api.departmentShell.getRosterMemberProfile, {
    departmentId,
    userId: row.userId,
  });

  const updateMembership = useMutation(
    api.departmentMemberships.updateDepartmentMembership,
  );
  const removeMember = useMutation(
    api.departmentMemberships.removeDepartmentMember,
  );
  const appointDelegate = useMutation(api.departmentMemberships.appointDelegate);
  const removeDelegate = useMutation(api.departmentMemberships.removeDelegate);

  const [title, setTitle] = useState(snapshot.positionTitle ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function run(key: string, action: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await action();
      if (key === "remove") onClose();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{row.displayName}</SheetTitle>
          <SheetDescription>
            {row.positionTitle ?? "No position set"}
            {row.clanName ? ` · ${row.clanName}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-4 pb-6">
          <div className="flex items-center gap-3">
            <Avatar name={row.displayName} src={row.photoUrl} size="lg" />
            <div className="flex flex-wrap gap-1.5">
              {row.isHod && <Badge variant="role">HOD</Badge>}
              {row.isDelegate && <Badge variant="role">Delegate</Badge>}
              {row.profileStatus !== "verified" && (
                <Badge variant="neutral">Not verified</Badge>
              )}
            </div>
          </div>

          {detail === undefined ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : detail === null ? (
            <p className="font-body text-sm text-on-surface-variant">
              This member&apos;s profile could not be loaded.
            </p>
          ) : (
            <dl className="space-y-3">
              <Detail label="Phone" value={detail.profile.phone ?? null} />
              <Detail label="Email" value={detail.user.email} />
              <Detail label="Clan" value={detail.clanName ?? "No clan yet"} />
              <Detail
                label="Occupation"
                value={detail.profile.occupation ?? null}
              />
              <Detail
                label="Mentorship"
                value={detail.profile.mentorshipStatus ?? null}
              />
              <Detail
                label="Children"
                value={
                  detail.children.length === 0
                    ? "None recorded"
                    : detail.children.map((c) => c.name).join(", ")
                }
              />
            </dl>
          )}

          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}

          {can.setPosition && (
            <Field
              label="Position"
              htmlFor="roster-position"
              hint="Free text, whatever this department calls the role. Leave it blank to clear."
            >
              <div className="flex items-center gap-2">
                <Input
                  id="roster-position"
                  value={title}
                  maxLength={POSITION_INPUT_MAX}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Sound lead"
                />
                <ActionButton
                  variant="gold"
                  loading={busy === "title"}
                  onClick={() =>
                    run("title", () =>
                      updateMembership({
                        membershipId: row.membershipId,
                        positionTitle: title,
                      }),
                    )
                  }
                >
                  Save
                </ActionButton>
              </div>
            </Field>
          )}

          {can.manageDelegates && !row.isHod && (
            <div className="space-y-2">
              <p className="font-body text-sm font-semibold text-on-surface">
                Delegate
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                A delegate runs the day to day work: activities, messages and
                adding members. Confirming requests, positions, removals and the
                department description stay yours.
              </p>
              {row.isDelegate ? (
                <ActionButton
                  variant="neutral"
                  loading={busy === "delegate"}
                  onClick={() =>
                    run("delegate", () =>
                      removeDelegate({ departmentId, userId: row.userId }),
                    )
                  }
                >
                  Stand down as delegate
                </ActionButton>
              ) : (
                <ActionButton
                  variant="gold"
                  disabled={row.profileStatus !== "verified"}
                  loading={busy === "delegate"}
                  onClick={() =>
                    run("delegate", () =>
                      appointDelegate({ departmentId, userId: row.userId }),
                    )
                  }
                >
                  Make a delegate
                </ActionButton>
              )}
            </div>
          )}

          {can.removeMember && (
            <div className="space-y-2">
              <p className="font-body text-sm font-semibold text-on-surface">
                Remove from this roster
              </p>
              {confirmRemove ? (
                <div className="space-y-2">
                  <p className="font-body text-xs text-on-surface-variant">
                    {row.displayName} will stop serving here, lose any role they
                    hold in this department, and be told privately. This cannot
                    be undone, though you can add them again.
                  </p>
                  <div className="flex items-center gap-2">
                    <ActionButton
                      variant="danger"
                      loading={busy === "remove"}
                      onClick={() =>
                        run("remove", () =>
                          removeMember({ membershipId: row.membershipId }),
                        )
                      }
                    >
                      Yes, remove them
                    </ActionButton>
                    <ActionButton
                      variant="neutral"
                      onClick={() => setConfirmRemove(false)}
                    >
                      Keep them
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <ActionButton
                  variant="danger"
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove from roster
                </ActionButton>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 font-body text-xs uppercase tracking-[0.1em] text-on-surface-variant">
        {label}
      </dt>
      <dd className="min-w-0 text-right font-body text-sm text-on-surface">
        {value ?? "—"}
      </dd>
    </div>
  );
}
