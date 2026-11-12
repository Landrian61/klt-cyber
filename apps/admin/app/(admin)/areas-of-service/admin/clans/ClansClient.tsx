"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ShieldCheck } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { errorMessage } from "@/lib/content-helpers";
import { Heading } from "@/components/ui/Heading";
import { type Column } from "@/components/ui/DataTable";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Avatar } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";

// The 12 clans and their elders (spec 0021, AC-7 to AC-10, SRS A3-05). The
// Administration HOD and the System Admin appoint, replace and remove elders;
// a delegate reads. The server enforces both rules itself.

type ClanRow = NonNullable<
  FunctionReturnType<typeof api.clans.listForAdministration>
>[number];

function ElderCell({ row }: { row: ClanRow }) {
  if (!row.elder) {
    return <span className="font-body text-sm font-semibold text-error">No elder</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <Avatar name={row.elder.name} src={row.elder.photoUrl ?? undefined} size="sm" />
      <span className="text-on-surface">{row.elder.name}</span>
    </span>
  );
}

function AppointElderDialog({
  clan,
  onClose,
}: {
  clan: ClanRow | null;
  onClose: () => void;
}) {
  const assignRole = useMutation(api.roles.assignRole);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useAuthQuery(
    api.clans.listElderCandidates,
    clan ? { clanId: clan._id, search: search || undefined } : "skip",
  );

  useEffect(() => {
    setSearch("");
    setUserId(null);
    setError(null);
  }, [clan?._id]);

  async function appoint() {
    if (!clan || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await assignRole({ roleType: "clan_elder", userId, clanId: clan._id });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const replacing = Boolean(clan?.elder);
  return (
    <Dialog open={clan !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {replacing ? "Replace the elder of" : "Appoint an elder for"} {clan?.name}
          </DialogTitle>
          <DialogDescription>
            {replacing
              ? `${clan?.elder?.name} stops being elder when you appoint someone else, and is told privately. The clan hears who its new elder is.`
              : "Only verified members of this clan can lead it."}
          </DialogDescription>
        </DialogHeader>

        <SearchInput
          defaultValue=""
          onDebouncedChange={setSearch}
          placeholder="Search this clan's members…"
          className="w-full"
        />

        <div className="subtle-scrollbar max-h-72 overflow-y-auto rounded-md bg-surface-low p-1">
          {candidates === undefined ? (
            <div className="flex flex-col gap-1 p-1" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-11 rounded-md" />
              ))}
            </div>
          ) : candidates === null || candidates.length === 0 ? (
            <p className="p-3 font-body text-sm text-on-surface-variant">
              {search
                ? "No verified member of this clan matches that name."
                : "This clan has no verified members yet."}
            </p>
          ) : (
            <ul role="listbox" aria-label="Verified members" className="flex flex-col gap-0.5">
              {candidates.map((person) => {
                const chosen = person.userId === userId;
                const sitting = person.userId === clan?.elder?.userId;
                return (
                  <li key={person.userId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={chosen}
                      disabled={sitting}
                      onClick={() => setUserId(person.userId)}
                      className={
                        chosen
                          ? "flex w-full items-center gap-3 rounded-md bg-primary-light px-3 py-2 text-left"
                          : "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-lowest disabled:opacity-60"
                      }
                    >
                      <Avatar name={person.name} src={person.photoUrl ?? undefined} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-body text-sm text-on-surface">
                        {person.name}
                      </span>
                      {sitting && (
                        <span className="font-body text-xs text-outline">Current elder</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <p className="font-body text-sm text-error">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={appoint} disabled={!userId || busy} loading={busy}>
            {replacing ? "Replace elder" : "Appoint elder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClansClient() {
  const clans = useAuthQuery(api.clans.listForAdministration, {});
  const authority = useAuthQuery(api.roles.getLeadershipAuthority, {});
  const canAppoint = authority?.canAppointLeaders ?? false;
  const revokeRole = useMutation(api.roles.revokeRole);

  const [appointing, setAppointing] = useState<ClanRow | null>(null);
  const [removing, setRemoving] = useState<ClanRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const vacant = clans?.filter((c) => !c.elder).length;

  async function remove() {
    if (!removing?.elder) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await revokeRole({ roleAssignmentId: removing.elder.roleAssignmentId });
      setRemoving(null);
    } catch (err) {
      setRemoveError(errorMessage(err));
    } finally {
      setRemoveBusy(false);
    }
  }

  function renderActions(row: ClanRow) {
    if (!canAppoint) return null;
    return (
      <div className="flex justify-end gap-2">
        {row.elder && (
          <Button
            variant="ghost"
            size="sm"
            className="text-error"
            onClick={(e) => {
              e.stopPropagation();
              setRemoveError(null);
              setRemoving(row);
            }}
          >
            Remove
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setAppointing(row);
          }}
        >
          {row.elder ? "Replace" : "Appoint"}
        </Button>
      </div>
    );
  }

  const columns: Column<ClanRow>[] = [
    {
      key: "name",
      header: "Clan",
      render: (row) => <span className="font-medium text-on-surface">{row.name}</span>,
    },
    { key: "elder", header: "Elder", render: (row) => <ElderCell row={row} /> },
    {
      key: "members",
      header: "Verified members",
      align: "right",
      render: (row) => (
        <span className="font-mono text-on-surface-variant">{row.verifiedMemberCount}</span>
      ),
    },
    ...(canAppoint
      ? [{ key: "actions", header: "", align: "right" as const, render: (row: ClanRow) => renderActions(row) }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Clans
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          The <span className="font-mono">12</span> clans and who leads them.
          {vacant !== undefined && vacant > 0 && (
            <>
              {" "}
              <span className="font-semibold text-error">
                <span className="font-mono">{vacant}</span> without an elder.
              </span>
            </>
          )}
        </p>
      </header>

      {clans === null ? (
        <EmptyState title="Not available" message="Clans are shown to Administration only." />
      ) : (
        <ResponsiveTable<ClanRow>
          columns={columns}
          rows={clans}
          rowKey={(row) => row._id}
          skeletonRows={6}
          card={(row) => (
            <RowCard>
              <div className="flex items-center justify-between gap-3">
                <p className="font-body text-sm font-semibold text-on-surface">{row.name}</p>
                <span className="font-body text-xs text-on-surface-variant">
                  <span className="font-mono">{row.verifiedMemberCount}</span> verified
                </span>
              </div>
              <div className="mt-2">
                <ElderCell row={row} />
              </div>
              {canAppoint && (
                <div className="mt-3">
                  {renderActions(row)}
                </div>
              )}
            </RowCard>
          )}
          empty={
            <EmptyState
              title="No clans found yet"
              message="The 12 clans will appear here once seeded."
            />
          }
        />
      )}

      {authority && !canAppoint && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Appointing and removing elders is for the Administration HOD.
        </p>
      )}

      <AppointElderDialog clan={appointing} onClose={() => setAppointing(null)} />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !removeBusy && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the elder of {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.elder?.name} stops being elder now and is told privately. The
              clan shows &ldquo;No elder&rdquo; until you appoint someone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && <p className="font-body text-sm text-error">{removeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Keep elder</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={removeBusy} onClick={remove}>
              Remove elder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
