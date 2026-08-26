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
import { Badge } from "@/components/shadcn/badge";
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

// Row shape comes straight from the joined Convex query — no hand-rolled
// client-side join anymore (see convex/departmentMemberships.ts).
type RosterRow = NonNullable<
  FunctionReturnType<
    typeof api.departmentMemberships.listDepartmentMembersWithProfiles
  >
>["members"][number];
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
  // One call, not two: the query resolves the Administration department
  // server-side and returns it alongside the roster, so the client no longer
  // fetches all 13 departments and matches on name just to issue a second,
  // dependent query.
  const roster = useAuthQuery(
    api.departmentMemberships.listDepartmentMembersWithProfiles,
    {},
  );
  const administrationDept = roster?.department;
  const rosterRows = roster?.members;

  const addMember = useMutation(api.departmentMemberships.addDepartmentMember);
  const removeMember = useMutation(
    api.departmentMemberships.removeDepartmentMember,
  );
  const assignRole = useMutation(api.roles.assignRole);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RosterRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only needed to diff against the roster for "Add member" candidates —
  // verified members who aren't already on this roster. Subscribed only while
  // that dialog is open: it reads every verified member, and most visits to
  // this screen never open it. Declared after `addOpen` for that reason.
  const allMembers = useAuthQuery(
    api.memberProfiles.listVerifiedMembersWithRoles,
    addOpen ? {} : "skip",
  );

  const rows = useMemo(() => {
    if (!rosterRows) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return rosterRows;
    return rosterRows.filter(
      ({ profile }) => profile && fullName(profile).toLowerCase().includes(q),
    );
  }, [rosterRows, search]);

  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const clampedPage = Math.min(page, pageCount);
  const paginated = rows?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  // Verified members not already on the roster — candidates for "Add member".
  const addCandidates = useMemo(() => {
    if (!allMembers || !rosterRows) return undefined;
    const onRoster = new Set(rosterRows.map((r) => r.membership.userId));
    const q = addSearch.trim().toLowerCase();
    return allMembers.filter((entry) => {
      if (onRoster.has(entry.profile.userId)) return false;
      if (!q) return true;
      return fullName(entry.profile).toLowerCase().includes(q);
    });
  }, [allMembers, rosterRows, addSearch]);

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

  const columns: Column<RosterRow>[] = [
    {
      key: "name",
      header: "Name",
      render: ({ profile, user, membership }) => {
        const name = profile ? fullName(profile) : "Unknown member";
        const selfAdded = membership.addedBy === membership.userId;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar
              name={name}
              src={profile?.photoUrl ?? user?.profilePictureUrl}
              size="md"
            />
            <div className="flex items-center gap-2">
              <span className="font-medium">{name}</span>
              {selfAdded && (
                <Badge variant="pending" className="text-xs">
                  Self-added
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "phone",
      header: "Phone",
      render: ({ profile }) => (
        <span className="text-sm text-muted-foreground">
          {profile?.phone ?? "—"}
        </span>
      ),
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
      key: "dateAdded",
      header: "Date added",
      render: ({ membership }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {new Date(membership._creationTime).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "addedBy",
      header: "Added by",
      render: ({ addedByName }) => addedByName ?? "—",
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
            {addCandidates?.map((entry: MemberEntry) => (
              <button
                key={entry.profile._id}
                type="button"
                disabled={busy}
                onClick={() => handleAdd(entry.profile.userId)}
                className="flex items-center gap-2.5 rounded-lg p-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Avatar
                  name={fullName(entry.profile)}
                  src={entry.profilePictureUrl ?? undefined}
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
              {selected?.profile ? fullName(selected.profile) : "Member"}
            </SheetTitle>
            <SheetDescription>
              {selected?.membership.positionTitle ?? "No title set"} ·
              Administration
              {selected?.membership.addedBy === selected?.membership.userId && (
                <span className="mt-1 block text-xs text-warning">
                  Self-added at profile submission — not yet reviewed by an HOD.
                </span>
              )}
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
