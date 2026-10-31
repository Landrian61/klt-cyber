"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { MAX_ACTIVE_DEPARTMENTS, profileLifecycleErrorMessage } from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";

/**
 * A role holder's own Areas of Service and clan, on every Settings page
 * (F2-07, F2-08, spec 0014 AC-19 to AC-22).
 *
 * The portal counterpart to the mobile section, and the same three rules:
 * adding creates a REQUEST the department's head confirms; a request can be
 * withdrawn while it waits; a confirmed seat can be left unless the person
 * leads it, in which case the reason is shown rather than the button hidden.
 *
 * Leaving confirms in a Dialog, because rejoining means a fresh request and
 * another wait — it is not a change somebody should make by mis-clicking.
 */
export function MyAreasOfServicePanel() {
  const mine = useAuthQuery(api.departmentMemberships.getMyDepartmentMemberships);
  const departments = useAuthQuery(api.departments.listDepartments);
  const clans = useAuthQuery(api.clans.listClans);
  const account = useAuthQuery(api.profile.getMyAccount);

  const addArea = useMutation(api.departmentMemberships.addMyAreaOfService);
  const withdrawClaim = useMutation(api.departmentMemberships.withdrawMyClaim);
  const leaveArea = useMutation(api.departmentMemberships.leaveMyAreaOfService);
  const changeMyClan = useMutation(api.profile.changeMyClan);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{
    departmentId: Id<"departments">;
    name: string;
  } | null>(null);

  // Only a verified member has any of this: a request to serve is actionable
  // only once the person asking has been reviewed.
  if (
    mine === undefined ||
    account === undefined ||
    departments === undefined
  ) {
    return <Skeleton className="h-64 w-full rounded-md" />;
  }
  if (mine === null || !account?.profile) return null;
  if (account.profile.profileStatus !== "verified") return null;

  const atCap = mine.length >= MAX_ACTIVE_DEPARTMENTS;
  const takenIds = new Set(mine.map((row) => row.departmentId));
  const available = (departments ?? []).filter((d) => !takenIds.has(d._id));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      // The shared sentence for a coded refusal, so the portal and the phone
      // say the same thing about the same rule.
      setMessage(profileLifecycleErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Your Areas of Service
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 p-0">
          {mine.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant">
              You are not serving anywhere yet. You can ask to join up to{" "}
              <span className="font-mono">{MAX_ACTIVE_DEPARTMENTS}</span> areas,
              and each one&apos;s head confirms you.
            </p>
          ) : (
            <ul className="space-y-2">
              {mine.map((row) => (
                <li
                  key={row._id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-low px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-body text-sm font-medium text-on-surface">
                      {row.departmentName}
                    </p>
                    <p className="font-body text-xs text-on-surface-variant">
                      {row.status === "pending_claim"
                        ? "Waiting for the head to confirm you"
                        : row.blockedByRole
                          ? `You are its ${row.blockedByRole}. That role has to end before you can leave.`
                          : "Serving here"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.status === "pending_claim" ? (
                      <>
                        <Badge variant="pending">Requested</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              withdrawClaim({ departmentId: row.departmentId }),
                            )
                          }
                        >
                          Withdraw
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="verified">Confirmed</Badge>
                        {!row.blockedByRole && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setLeaving({
                                departmentId: row.departmentId,
                                name: row.departmentName,
                              })
                            }
                          >
                            Leave
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Field
            label="Ask to serve somewhere else"
            htmlFor="add-area-of-service"
            hint={
              atCap
                ? `That is as many as one person can hold (${MAX_ACTIVE_DEPARTMENTS}). Leave one first.`
                : "The department's head confirms your request."
            }
          >
            <Select
              value=""
              disabled={busy || atCap || available.length === 0}
              onValueChange={(v) =>
                run(() => addArea({ departmentId: v as Id<"departments"> }))
              }
            >
              <SelectTrigger id="add-area-of-service">
                <SelectValue placeholder="Choose an area of service" />
              </SelectTrigger>
              <SelectContent>
                {available.map((d) => (
                  <SelectItem key={d._id} value={d._id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Your clan"
            htmlFor="my-clan"
            hint="Your new clan's elder is told when you join, and your old one is told when you leave."
          >
            <Select
              value={account.profile.clanId ?? ""}
              disabled={busy}
              onValueChange={(v) =>
                run(() => changeMyClan({ clanId: v as Id<"clans"> }))
              }
            >
              <SelectTrigger id="my-clan">
                <SelectValue placeholder="Choose your clan" />
              </SelectTrigger>
              <SelectContent>
                {(clans ?? []).map((clan) => (
                  <SelectItem key={clan._id} value={clan._id}>
                    {clan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {message && (
            <p
              role="status"
              className="rounded-md bg-warning-light p-3 font-body text-sm text-on-surface"
            >
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={leaving !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setLeaving(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave {leaving?.name}?</DialogTitle>
            <DialogDescription>
              You will come off the roster and its head will be told. Joining
              again means a fresh request and another wait for them to confirm
              it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setLeaving(null)}
            >
              Stay
            </Button>
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                if (!leaving) return;
                await run(() =>
                  leaveArea({ departmentId: leaving.departmentId }),
                );
                setLeaving(null);
              }}
            >
              Leave the roster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
