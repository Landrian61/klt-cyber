"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { UserPlus, Crown } from "lucide-react";
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
import { MembershipTitleEditor } from "@/components/admin/MembershipTitleEditor";
import { Skeleton } from "@/components/shadcn/skeleton";
import { errorMessage } from "../verification/shared";
import { ProfileDetails } from "../verification/ProfileDetails";
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

   // Needed for "Name a department HOD" — reaches into the wider directory,
   // not just this roster.
   const departments = useAuthQuery(api.departments.listDepartments);
   const myRoles = useAuthQuery(api.roles.getMyRoles);
   const administrationHods = useAuthQuery(
     api.departmentMemberships.listDepartmentHods,
     administrationDept ? { departmentId: administrationDept._id } : "skip",
   );

   const isSystemAdmin =
     myRoles?.some((r) => r.roleType === "system_admin") ?? false;
   const isAdministrationHod =
     myRoles?.some(
       (r) =>
         r.roleType === "hod" && r.departmentId === administrationDept?._id,
     ) ?? false;
   const needsBootstrap =
     isSystemAdmin && !!administrationHods && administrationHods.length === 0;

          const addMember = useMutation(
       api.departmentMemberships.addDepartmentMember,
     );

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

 const [nameHodOpen, setNameHodOpen] = useState(false);
 const [nameHodDeptId, setNameHodDeptId] = useState<Id<"departments"> | "">("");
 const [nameHodUserId, setNameHodUserId] = useState<Id<"users"> | "">("");
 const [nameHodError, setNameHodError] = useState<string | null>(null);
 const [nameHodBusy, setNameHodBusy] = useState(false);

  const [bootstrapOpen, setBootstrapOpen] = useState(false);
 const [bootstrapUserId, setBootstrapUserId] = useState<Id<"users"> | "">("");
 const [bootstrapError, setBootstrapError] = useState<string | null>(null);
 const [bootstrapBusy, setBootstrapBusy] = useState(false);

  const selectedProfile = useAuthQuery(
    api.memberProfiles.getProfileForReview,
    selected?.profile ? { profileId: selected.profile._id } : "skip",
  );

  // Only needed to diff against

  // Only needed to diff against the roster for "Add member" candidates —
  // verified members who aren't already on this roster. Subscribed only while
  // that dialog is open: it reads every verified member, and most visits to
  // this screen never open it. Declared after `addOpen` for that reason.
  const allMembers = useAuthQuery(
    api.memberProfiles.listVerifiedMembersWithRoles,
     addOpen || nameHodOpen || bootstrapOpen ? {} : "skip",
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
    async function handleNameHod() {
      if (!nameHodDeptId || !nameHodUserId) return;
      setNameHodBusy(true);
      setNameHodError(null);
      try {
        await assignRole({
          roleType: "hod",
          userId: nameHodUserId,
          departmentId: nameHodDeptId,
        });
        setNameHodOpen(false);
        setNameHodDeptId("");
        setNameHodUserId("");
      } catch (err) {
        setNameHodError(errorMessage(err));
      } finally {
        setNameHodBusy(false);
      }
    }

    async function handleBootstrap() {
      if (!bootstrapUserId || !administrationDept) return;
      setBootstrapBusy(true);
      setBootstrapError(null);
      try {
        await assignRole({
          roleType: "hod",
          userId: bootstrapUserId,
          departmentId: administrationDept._id,
        });
        setBootstrapOpen(false);
        setBootstrapUserId("");
      } catch (err) {
        setBootstrapError(errorMessage(err));
      } finally {
        setBootstrapBusy(false);
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
        {needsBootstrap && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-primary-light p-4">
            <div>
              <p className="font-body text-sm font-semibold text-on-surface">
                Administration has no HOD yet
              </p>
              <p className="font-body text-sm text-on-surface-variant">
                As System Admin, you can name the first one to get this
                department running.
              </p>
            </div>
            <Button size="sm" onClick={() => setBootstrapOpen(true)}>
              Name first HOD
            </Button>
          </div>
        )}

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
            {(isSystemAdmin || isAdministrationHod) && (
              <Button
                variant="secondary"
                onClick={() => setNameHodOpen(true)}
                className="gap-1.5"
              >
                <Crown className="h-4 w-4" />
                Name a department HOD
              </Button>
            )}
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

        {/* Name a department HOD — reaches into the wider directory, not
          just this roster. */}
        <Dialog open={nameHodOpen} onOpenChange={setNameHodOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Name a department HOD</DialogTitle>
              <DialogDescription>
                Choose a department and a verified member to appoint as its Head
                of Department.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <Field label="Department" htmlFor="hod-department">
                <Select
                  value={nameHodDeptId}
                  onValueChange={(v) =>
                    setNameHodDeptId(v as Id<"departments">)
                  }
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

              <Field label="Member" htmlFor="hod-member">
                <Select
                  value={nameHodUserId}
                  onValueChange={(v) => setNameHodUserId(v as Id<"users">)}
                >
                  <SelectTrigger id="hod-member">
                    <SelectValue placeholder="Choose a verified member" />
                  </SelectTrigger>
                  <SelectContent>
                    {allMembers?.map((entry) => (
                      <SelectItem
                        key={entry.profile._id}
                        value={entry.profile.userId}
                      >
                        {fullName(entry.profile)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {nameHodError && (
                <p className="text-sm text-destructive">{nameHodError}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setNameHodOpen(false)}
                disabled={nameHodBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleNameHod}
                disabled={nameHodBusy || !nameHodDeptId || !nameHodUserId}
                loading={nameHodBusy}
              >
                Appoint HOD
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bootstrap: name Administration's first HOD. System Admin only. */}
        <Dialog open={bootstrapOpen} onOpenChange={setBootstrapOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Name Administration&apos;s first HOD</DialogTitle>
              <DialogDescription>
                Pick a verified member to become Administration&apos;s Head of
                Department.
              </DialogDescription>
            </DialogHeader>

            <Field label="Member" htmlFor="bootstrap-member">
              <Select
                value={bootstrapUserId}
                onValueChange={(v) => setBootstrapUserId(v as Id<"users">)}
              >
                <SelectTrigger id="bootstrap-member">
                  <SelectValue placeholder="Choose a verified member" />
                </SelectTrigger>
                <SelectContent>
                  {allMembers?.map((entry) => (
                    <SelectItem
                      key={entry.profile._id}
                      value={entry.profile.userId}
                    >
                      {fullName(entry.profile)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {bootstrapError && (
              <p className="text-sm text-destructive">{bootstrapError}</p>
            )}

            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setBootstrapOpen(false)}
                disabled={bootstrapBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBootstrap}
                disabled={bootstrapBusy || !bootstrapUserId}
                loading={bootstrapBusy}
              >
                Appoint as HOD
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Member detail + actions */}
        <Sheet
          open={selected !== null}
          onOpenChange={(open) => !open && setSelected(null)}
        >
          <SheetContent className="overflow-y-auto bg-surface-low sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>
                {selected?.profile ? fullName(selected.profile) : "Member"}
              </SheetTitle>
              <SheetDescription>
                {selected?.membership.positionTitle ?? "No title set"} ·
                Administration
                {selected?.membership.addedBy ===
                  selected?.membership.userId && (
                  <span className="mt-1 block text-xs text-warning">
                    Self-added at profile submission — not yet reviewed by an
                    HOD.
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            {error && <p className="px-4 text-sm text-destructive">{error}</p>}

            {selected && (
              <div className="flex flex-col gap-4 px-4">
                {/* key: remount on a different member so the input reseeds. */}
                <MembershipTitleEditor
                  key={selected.membership._id}
                  membershipId={selected.membership._id}
                  currentTitle={selected.membership.positionTitle}
                  onSaved={() => setSelected(null)}
                />

                {selectedProfile === undefined ? (
                  <div className="flex flex-col gap-3" aria-busy="true">
                    <Skeleton className="h-24 rounded-md" />
                    <Skeleton className="h-40 rounded-md" />
                  </div>
                ) : selectedProfile === null ? (
                  <p className="font-body text-sm text-on-surface-variant">
                    Profile unavailable.
                  </p>
                ) : (
                  <ProfileDetails profile={selectedProfile} />
                )}
              </div>
            )}

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
