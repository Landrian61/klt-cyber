"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Users } from "lucide-react";

import { api, type Id } from "@/lib/api";
import { useAuthPaginatedQuery } from "@/lib/useAuthPaginatedQuery";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Heading } from "@/components/ui/Heading";
import { RowCard } from "@/components/ui/ResponsiveTable";
import { formatMoment, hospitalityError } from "./hospitalityErrors";

type QueueRow = FunctionReturnType<
  typeof api.hospitality.listClanQueue
>["page"][number];
type ClanSize = NonNullable<
  FunctionReturnType<typeof api.hospitality.getClanSizes>
>[number];

const PAGE_SIZE = 25;
const SECTION = "rounded-md border border-border bg-surface-lowest p-5 shadow-e1";

/**
 * Clan placement (spec 0024, AC-32 to AC-34, H5-02 to H5-04).
 *
 * Clan sizes on top, the smallest highlighted so the team evens clans out;
 * below, verified members with no clan, longest waiting first, each placed
 * with one choice. The server only ever fills an empty clan, so a member who
 * chose one a moment ago is refused, not moved.
 */
export function ClanPlacementPage() {
  const sizes = useAuthQuery(api.hospitality.getClanSizes, {});
  const { results, status, loadMore } = useAuthPaginatedQuery(
    api.hospitality.listClanQueue,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  // Placed rows drop out after the read, so a page can come back short.
  const [target, setTarget] = useState(PAGE_SIZE);
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < target) loadMore(PAGE_SIZE);
  }, [status, results.length, target, loadMore]);

  const rows = results as QueueRow[];

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <Heading as="h1" size="xl">
          Clan placement
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          Verified members without a clan. The member and the clan’s elder are
          told when you place someone.
        </p>
      </div>

      <section className={SECTION} aria-labelledby="clan-sizes">
        <Heading as="h2" size="lg" id="clan-sizes">
          Clan sizes
        </Heading>
        <p className="mb-4 mt-1 font-body text-sm text-on-surface-variant">
          Verified members per clan. The smallest are highlighted.
        </p>
        {sizes === undefined ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 rounded-md" />
            ))}
          </div>
        ) : !sizes || sizes.length === 0 ? (
          <p className="font-body text-sm text-on-surface-variant">
            No clans are set up yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sizes.map((clan) => (
              <li
                key={clan.clanId}
                className={
                  clan.highlighted
                    ? "rounded-md bg-primary-light p-3"
                    : "rounded-md bg-surface-low p-3"
                }
              >
                <p className="truncate font-body text-sm font-medium text-on-surface">
                  {clan.name}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-lg text-on-surface">
                    {clan.verifiedCount}
                  </span>
                  {clan.highlighted && <Badge variant="member">Smallest</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="clan-queue" className="space-y-3">
        <Heading as="h2" size="lg" id="clan-queue">
          Waiting for a clan
        </Heading>
        {status === "LoadingFirstPage" ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 && status === "Exhausted" ? (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden />}
            title="Everyone has a clan"
            message="Verified members without a clan will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.profileId}>
                <QueueCard row={row} clans={sizes ?? []} />
              </li>
            ))}
          </ul>
        )}
        {status === "CanLoadMore" && results.length >= target && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTarget(results.length + PAGE_SIZE)}
            >
              Show more
            </Button>
          </div>
        )}
        {(status === "LoadingMore" ||
          (status === "CanLoadMore" && results.length < target)) && (
          <p
            className="text-center font-body text-sm text-on-surface-variant"
            aria-live="polite"
          >
            Loading more…
          </p>
        )}
      </section>
    </div>
  );
}

/** One waiting member, with the clan choice and the place button. */
function QueueCard({ row, clans }: { row: QueueRow; clans: ClanSize[] }) {
  const assign = useMutation(api.hospitality.assignClan);
  const [clanId, setClanId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = `clan-${row.profileId}`;

  async function place() {
    if (!clanId) return;
    setBusy(true);
    setError(null);
    try {
      await assign({ profileId: row.profileId, clanId: clanId as Id<"clans"> });
      // The row leaves the queue on its own once the subscription updates.
    } catch (caught) {
      setError(hospitalityError(caught));
      setBusy(false);
    }
  }

  return (
    <RowCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.displayName} src={row.photoUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-medium text-on-surface">
              {row.displayName}
            </p>
            <p className="font-body text-xs text-on-surface-variant">
              {row.verifiedAt ? (
                <>
                  Verified{" "}
                  <span className="font-mono">{formatMoment(row.verifiedAt)}</span>
                </>
              ) : (
                "Verified before dates were kept"
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={selectId} className="sr-only">
            Clan for {row.displayName}
          </label>
          <Select value={clanId} onValueChange={setClanId} disabled={busy}>
            <SelectTrigger id={selectId} className="w-full sm:w-48">
              <SelectValue placeholder="Choose a clan" />
            </SelectTrigger>
            <SelectContent>
              {clans.map((clan) => (
                <SelectItem key={clan.clanId} value={clan.clanId}>
                  {clan.name} ({clan.verifiedCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="primary"
            size="sm"
            disabled={!clanId || busy}
            onClick={() => void place()}
          >
            {busy ? "Placing…" : "Place"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 font-body text-sm text-error">
          {error}
        </p>
      )}
    </RowCard>
  );
}
