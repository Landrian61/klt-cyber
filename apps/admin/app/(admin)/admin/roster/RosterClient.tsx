"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { UserPlus } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/shadcn/button";
import { Avatar } from "@/components/shadcn/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/shadcn/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/shadcn/sheet";
import { errorMessage } from "../verification/shared";

const PAGE_SIZE = 10;
const ADMINISTRATION_DEPARTMENT_NAME = "Administration";

type Membership = NonNullable<
  FunctionReturnType<typeof api.departmentMemberships.listDepartmentMembers>
>[number];
type MemberEntry = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listVerifiedMembersWithRoles>
>[number];

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function RosterClient() {
  const departments = useAuthQuery(api.departments.listDepartments);
  const administrationDept = departments?.find(
    (d) => d.name === ADMINISTRATION_DEPARTMENT_NAME,
  );

  const memberships = useAuthQuery(
    api.departmentMemberships.listDepartmentMembers,
    administrationDept ? { departmentId: administrationDept._id } : "skip",
  );
  const allMembers = useAuthQuery(
    api.memberProfiles.listVerifiedMembersWithRoles,
  );

  const addMember = useMutation(api.departmentMemberships.addDepartmentMember);
  const removeMember = useMutation(
    api.departmentMemberships.removeDepartmentMember,
  );
  const assignRole = useMutation(api.roles.assignRole);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{
    membership: Membership;
    entry?: MemberEntry;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // listDepartmentMembers returns raw membership rows with no profile join —
  // cross-referenced here against listVerifiedMembersWithRoles as a stopgap
  // until a joined query exists on the backend.
  const memberByUserId = useMemo(() => {
    const map = new Map<Id<"users">, MemberEntry>();
    allMembers?.forEach((entry) => map.set(entry.profile.userId, entry));
    return map;
  }, [allMembers]);

  const rows = useMemo(() => {
    if (!memberships) return undefined;
    const q = search.trim().toLowerCase();
    return memberships
      .map((membership) => ({
        membership,
        entry: memberByUserId.get(membership.userId),
      }))
      .filter(({ entry }) => {
        if (!q) return true;
        if (!entry) return false;
        return fullName(entry.profile).toLowerCase().includes(q);
      });
  }, [memberships, memberByUserId, search]);

  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const clampedPage = Math.min(page, pageCount);
  const paginated = rows?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  // Verified members not already on the roster — candidates for "Add member".
  const addCandidates = useMemo(() => {
    if (!allMembers || !memberships) return undefined;
    const onRoster = new Set(memberships.map((m) => m.userId));
    const q = addSearch.trim().toLowerCase();
    return allMembers.filter((entry) => {
      if (onRoster.has(entry.profile.userId)) return false;
      if (!q) return true;
      return fullName(entry.profile).toLowerCase().includes(q);
    });
  }, [allMembers, memberships, addSearch]);

  async function handleAdd(userId: Id<"users">) {
    if (!administrationDept) return;
    setBusy(true);
    setError(null);
    try {
      await addMember({ departmentId: administrationDept._id, userId });
      setAddOpen(false);
      setAddSearch("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await removeMember({ membershipId: selected.membership._id });
      setSelected(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAppointDelegate() {
    if (!selected || !administrationDept) return;
    setBusy(true);
    setError(null);
    try {
      await assignRole({
        roleType: "department_admin",
        userId: selected.membership.userId,
        departmentId: administrationDept._id,
      });
      setSelected(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<{ membership: Membership; entry?: MemberEntry }>[] = [
    {
      key: "name",
      header: "Name",
      render: ({ entry }) => {
        const name = entry ? fullName(entry.profile) : "Unknown member";
        return (
          <div className="flex items-center gap-2.5">
            <Avatar
              name={name}
              src={entry?.user?.profilePictureUrl}
              size="md"
            />
            <span className="font-medium">{name}</span>
          </div>
        );
      },
    },
    {
      key: "position",
      header: "Position",
      render: ({ membership }) =>
        membership.positionTitle ? (
          <span className="text-sm">{membership.positionTitle}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "addedBy",
      header: "Added by",
      render: ({ membership }) => {
        const addedBy = memberByUserId.get(membership.addedBy as Id<"users">);
        return addedBy ? fullName(addedBy.profile) : "—";
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading size="xl">Roster</Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows === undefined ? "—" : rows.length} active member
            {rows?.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder="Search by name…"
            onDebouncedChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <Button
            onClick={() => setAddOpen(true)}
            disabled={!administrationDept}
            className="gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            Add member
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={paginated}
        rowKey={(row) => row.membership._id}
        onRowClick={(row) => setSelected(row)}
        empty={
          <EmptyState
            title="No roster members yet"
            message="Add a verified member to get started."
          />
        }
      />

      {rows && rows.length > 0 && (
        <Pagination
          page={clampedPage}
          pageCount={pageCount}
          onPageChange={setPage}
        />
      )}

      {/* Add member */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>
              Search verified members not already on this roster.
            </DialogDescription>
          </DialogHeader>
          <SearchInput
            placeholder="Search by name…"
            onDebouncedChange={setAddSearch}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {addCandidates === undefined && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {addCandidates?.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No matching verified members.
              </p>
            )}
            {addCandidates?.map((entry) => (
              <button
                key={entry.profile._id}
                type="button"
                disabled={busy}
                onClick={() => handleAdd(entry.profile.userId)}
                className="flex items-center gap-2.5 rounded-lg p-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Avatar
                  name={fullName(entry.profile)}
                  src={entry.user?.profilePictureUrl}
                  size="sm"
                />
                {fullName(entry.profile)}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Member detail + actions */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selected?.entry ? fullName(selected.entry.profile) : "Member"}
            </SheetTitle>
            <SheetDescription>
              {selected?.membership.positionTitle ?? "No title set"} ·
              Administration
            </SheetDescription>
          </SheetHeader>

          {error && <p className="px-4 text-sm text-destructive">{error}</p>}

          <SheetFooter className="flex-col gap-2">
            {/*
              Backend enforces who can actually complete these (removeMember
              is HOD-only server-side); buttons render for anyone with roster
              access and surface the real authorization error if attempted
              without permission, rather than guessing at role state
              client-side against an unconfirmed access-check return shape.
            */}
            <ActionButton
              variant="gold"
              onClick={handleAppointDelegate}
              disabled={busy}
            >
              Appoint as delegate
            </ActionButton>
            <ActionButton
              variant="danger"
              onClick={handleRemove}
              disabled={busy}
            >
              Remove from roster
            </ActionButton>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
