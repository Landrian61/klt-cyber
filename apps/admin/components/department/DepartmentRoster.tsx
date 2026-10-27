"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Clock, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { errorMessage } from "@/lib/content-helpers";
import { Heading } from "@/components/ui/Heading";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterBar, SegmentedFilter } from "@/components/ui/FilterBar";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import type { Column } from "@/components/ui/DataTable";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Reveal } from "@/components/motion/Reveal";
import type { DepartmentShellContext } from "./DepartmentShellProvider";
import { RosterMemberSheet } from "./RosterMemberSheet";
import { AddMemberDialog } from "./AddMemberDialog";
import { DeclineClaimDialog } from "./DeclineClaimDialog";

/**
 * A department's roster, and the people asking to join it (spec 0012, AC-10 to
 * AC-20).
 *
 * Two lists, deliberately kept apart: the people who serve here, and the
 * requests waiting on a decision. A claimant is not a member — never counted,
 * never notified — so showing them in one list with a quieter badge would be
 * the wrong shape.
 */

type Roster = NonNullable<
  FunctionReturnType<typeof api.departmentMemberships.listRosterWithClaims>
>;
type RosterRow = Roster["active"][number];

const MENTORSHIP_LABELS: Record<string, string> = {
  not_enrolled: "Not enrolled",
  enrolled: "Enrolled",
  completed: "Completed",
};

/** The three labels three similar-looking rows must read differently as. */
function StandingBadge({ row }: { row: RosterRow }) {
  if (row.status === "pending_claim") {
    // Two different situations, and the tone says which: one is waiting on YOU,
    // the other is waiting on Administration verifying their profile.
    return row.profileStatus === "verified" ? (
      <Badge variant="pending">Awaiting confirmation</Badge>
    ) : (
      <Badge variant="neutral">Not yet verified</Badge>
    );
  }
  if (row.profileStatus !== "verified") {
    // A grandfathered self-added row. It stays on the roster, labelled, and is
    // excluded from the verified count — which is why the two numbers on the
    // dashboard legitimately differ.
    return <Badge variant="neutral">Not verified</Badge>;
  }
  if (row.isHod) return <Badge variant="role">HOD</Badge>;
  if (row.isDelegate) return <Badge variant="role">Delegate</Badge>;
  return null;
}

export function DepartmentRoster({
  departmentId,
  can,
}: {
  departmentId: Id<"departments">;
  can: DepartmentShellContext["can"];
}) {
  const roster = useAuthQuery(
    api.departmentMemberships.listRosterWithClaims,
    { departmentId },
  );

  const confirmClaim = useMutation(api.departmentMemberships.confirmClaim);

  const [search, setSearch] = useState("");
  const [clanFilter, setClanFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [selected, setSelected] = useState<RosterRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [declining, setDeclining] = useState<RosterRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => {
    if (!roster) return undefined;
    const q = search.trim().toLowerCase();
    return roster.active.filter((row) => {
      if (q && !row.displayName.toLowerCase().includes(q)) return false;
      if (clanFilter !== "all" && row.clanName !== clanFilter) return false;
      if (positionFilter !== "all" && row.positionTitle !== positionFilter) {
        return false;
      }
      return true;
    });
  }, [roster, search, clanFilter, positionFilter]);

  const filtering =
    search.trim() !== "" || clanFilter !== "all" || positionFilter !== "all";

  async function handleConfirm(row: RosterRow) {
    setError(null);
    setBusyId(row.membershipId);
    try {
      await confirmClaim({ membershipId: row.membershipId });
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusyId(null);
    }
  }

  if (roster === null) {
    return <ErrorState />;
  }

  const columns: Column<RosterRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.displayName} src={row.photoUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-on-surface">
              {row.displayName}
            </p>
            <div className="mt-0.5">
              <StandingBadge row={row} />
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "clan",
      header: "Clan",
      render: (row) => (
        <span className="text-on-surface-variant">
          {row.clanName ?? "No clan yet"}
        </span>
      ),
    },
    {
      key: "position",
      header: "Position",
      render: (row) => (
        <span className={row.positionTitle ? "text-on-surface" : "text-outline"}>
          {row.positionTitle ?? "—"}
        </span>
      ),
    },
    {
      key: "mentorship",
      header: "Mentorship",
      render: (row) => (
        <span className="text-on-surface-variant">
          {row.mentorshipStatus
            ? MENTORSHIP_LABELS[row.mentorshipStatus] ?? row.mentorshipStatus
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Heading as="h1" size="xl">
            Roster
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            {roster ? (
              <>
                <span className="font-mono">{roster.active.length}</span> serving
                here
                {roster.pending.length > 0 && (
                  <>
                    {" · "}
                    <span className="font-mono">{roster.pending.length}</span>{" "}
                    waiting
                  </>
                )}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
        {can.addMember && (
          <ActionButton variant="gold" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            Add a member
          </ActionButton>
        )}
      </header>

      {error && (
        <p role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      )}

      {/* Requests first: someone waiting on a decision is the one thing on this
          page that needs the department head to act. */}
      {can.viewPendingClaimants && roster && roster.pending.length > 0 && (
        <Reveal as="section" className="space-y-3">
          <h2 className="flex items-center gap-2 font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            <Clock className="size-4 text-primary" aria-hidden="true" />
            Asking to serve here
          </h2>
          <ul className="space-y-3">
            {roster.pending.map((row) => {
              const verified = row.profileStatus === "verified";
              return (
                <li
                  key={row.membershipId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-lowest p-4 shadow-e1"
                >
                  <Avatar name={row.displayName} src={row.photoUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm font-semibold text-on-surface">
                      {row.displayName}
                    </p>
                    <p className="font-body text-xs text-on-surface-variant">
                      Asked on{" "}
                      <span className="font-mono">
                        {new Date(row.claimedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {row.clanName ? ` · ${row.clanName}` : ""}
                    </p>
                    {!verified && (
                      <p className="mt-1 font-body text-xs text-outline">
                        Their member profile has not been verified yet, so they
                        cannot join a roster. Administration verifies profiles.
                      </p>
                    )}
                  </div>
                  {can.confirmClaim && (
                    <div className="flex shrink-0 items-center gap-2">
                      <ActionButton
                        variant="gold"
                        disabled={!verified}
                        loading={busyId === row.membershipId}
                        onClick={() => handleConfirm(row)}
                      >
                        Confirm
                      </ActionButton>
                      <ActionButton
                        variant="neutral"
                        onClick={() => setDeclining(row)}
                      >
                        Decline
                      </ActionButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Reveal>
      )}

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          <Users className="size-4 text-primary" aria-hidden="true" />
          Serving here
        </h2>

        <FilterBar
          showClear={filtering}
          onClearAll={() => {
            setSearch("");
            setClanFilter("all");
            setPositionFilter("all");
          }}
        >
          <SearchInput
            defaultValue={search}
            onDebouncedChange={setSearch}
            placeholder="Search by name…"
            className="min-w-56 flex-1"
          />
          {roster && roster.filters.clanNames.length > 0 && (
            <SegmentedFilter
              size="sm"
              ariaLabel="Filter by clan"
              value={clanFilter}
              onChange={setClanFilter}
              options={[
                { value: "all", label: "All clans" },
                ...roster.filters.clanNames.map((name) => ({
                  value: name,
                  label: name,
                })),
              ]}
            />
          )}
          {roster && roster.filters.positions.length > 0 && (
            <SegmentedFilter
              size="sm"
              ariaLabel="Filter by position"
              value={positionFilter}
              onChange={setPositionFilter}
              options={[
                { value: "all", label: "All positions" },
                ...roster.filters.positions.map((title) => ({
                  value: title,
                  label: title,
                })),
              ]}
            />
          )}
        </FilterBar>

        <ResponsiveTable<RosterRow>
          columns={columns}
          rows={active}
          rowKey={(row) => row.membershipId}
          onRowClick={can.viewFullProfiles ? setSelected : undefined}
          empty={
            <EmptyState
              title={filtering ? "Nobody matches that" : "Nobody serves here yet"}
              message={
                filtering
                  ? "Try a different name, clan or position."
                  : can.addMember
                    ? "Add a verified member, or wait for someone to ask to serve."
                    : "This roster is empty for now."
              }
            />
          }
          card={(row) => (
            <RowCard
              onClick={can.viewFullProfiles ? () => setSelected(row) : undefined}
            >
              <div className="flex items-center gap-3">
                <Avatar name={row.displayName} src={row.photoUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-semibold text-on-surface">
                    {row.displayName}
                  </p>
                  <p className="truncate font-body text-xs text-on-surface-variant">
                    {row.positionTitle ?? "No position"}
                    {row.clanName ? ` · ${row.clanName}` : ""}
                  </p>
                </div>
                <StandingBadge row={row} />
              </div>
              <p className="mt-2 font-body text-xs text-outline">
                Mentorship:{" "}
                {row.mentorshipStatus
                  ? MENTORSHIP_LABELS[row.mentorshipStatus] ?? row.mentorshipStatus
                  : "—"}
              </p>
            </RowCard>
          )}
        />
      </section>

      {roster?.scope === "administration" && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          You are reading this roster as Administration. Confirming requests,
          positions and delegates are this department&apos;s head to decide.
        </p>
      )}

      {can.removeMember && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <UserMinus className="size-3.5" aria-hidden="true" />
          Removing someone also takes away any role they hold in this
          department.
        </p>
      )}

      {selected && (
        <RosterMemberSheet
          key={selected.membershipId}
          departmentId={departmentId}
          row={selected}
          can={can}
          onClose={() => setSelected(null)}
        />
      )}

      {adding && (
        <AddMemberDialog
          departmentId={departmentId}
          onClose={() => setAdding(false)}
        />
      )}

      {declining && (
        <DeclineClaimDialog
          membershipId={declining.membershipId}
          memberName={declining.displayName}
          onClose={() => setDeclining(null)}
        />
      )}
    </div>
  );
}
