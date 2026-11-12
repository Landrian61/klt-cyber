"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { errorMessage } from "@/lib/content-helpers";

// Appoint (or replace) a department's HOD. One dialog for the Administration
// roster's "Name a department HOD" (with a department picker) and the
// Departments page's "Appoint HOD" / "Replace HOD" (department fixed), spec
// 0021 AC-6. It calls `roles.assignRole` with `roleType: "hod"`, whose revoke
// and replace rules end any sitting HOD; only the System Admin and the
// Administration HOD may, and the server checks that itself.

function fullName(p: { firstName: string; middleName?: string; lastName: string }) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function AppointHodDialog({
  open,
  onOpenChange,
  department,
  currentHodName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed department; omit to let the person choose one. */
  department?: { _id: Id<"departments">; name: string };
  /** The sitting HOD, when replacing. */
  currentHodName?: string | null;
}) {
  const assignRole = useMutation(api.roles.assignRole);
  const departments = useAuthQuery(
    api.departments.listDepartments,
    open && !department ? {} : "skip",
  );
  // Reads every verified member, so only while the dialog is open.
  const members = useAuthQuery(
    api.memberProfiles.listVerifiedMembersWithRoles,
    open ? {} : "skip",
  );

  const [departmentId, setDepartmentId] = useState<Id<"departments"> | "">(
    department?._id ?? "",
  );
  const [userId, setUserId] = useState<Id<"users"> | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDepartmentId(department?._id ?? "");
    setUserId("");
    setError(null);
  }, [open, department?._id]);

  async function appoint() {
    if (!departmentId || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await assignRole({ roleType: "hod", userId, departmentId });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const replacing = Boolean(currentHodName);
  const title = department
    ? `${replacing ? "Replace" : "Appoint"} the HOD of ${department.name}`
    : "Name a department HOD";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {replacing
              ? `${currentHodName} stops being HOD the moment you appoint someone else, and is told privately.`
              : "Choose a verified member to appoint as Head of Department."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!department && (
            <Field label="Department" htmlFor="hod-department">
              <Select
                value={departmentId}
                onValueChange={(v) => setDepartmentId(v as Id<"departments">)}
              >
                <SelectTrigger id="hod-department">
                  <SelectValue placeholder="Choose a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Member" htmlFor="hod-member">
            <Select value={userId} onValueChange={(v) => setUserId(v as Id<"users">)}>
              <SelectTrigger id="hod-member">
                <SelectValue
                  placeholder={
                    members === undefined ? "Loading members…" : "Choose a verified member"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {members?.map((entry) => (
                  <SelectItem key={entry.profile._id} value={entry.profile.userId}>
                    {fullName(entry.profile)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={appoint} disabled={busy || !departmentId || !userId} loading={busy}>
            {replacing ? "Replace HOD" : "Appoint HOD"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
