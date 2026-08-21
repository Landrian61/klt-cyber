"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/shadcn/badge";
import { Avatar } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { ReviewMode } from "./ReviewMode";
import { fullName } from "./shared";

// Row shape comes straight from the Convex query — no hand-rolled drift.
type PendingProfile = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listPendingVerifications>
>[number];

export function VerificationClient() {
  const router = useRouter();
  const pending = useAuthQuery(api.memberProfiles.listPendingVerifications);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "review">("list");

  const filtered = useMemo(() => {
    if (!pending) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) => fullName(p).toLowerCase().includes(q));
  }, [pending, search]);

  // Review mode works the same filtered set list view shows — search then
  // review keeps the two views consistent instead of review always seeing
  // the full queue regardless of what's been filtered out.
  const filteredIds = useMemo<Id<"memberProfiles">[]>(
    () => (filtered ?? []).map((p) => p._id),
    [filtered],
  );

  const columns: Column<PendingProfile>[] = [
    {
      key: "photo",
      header: "Photo",
      render: (profile) => (
        <Avatar name={fullName(profile)} src={profile.photoUrl} size="md" />
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (profile) => (
        <span className="font-medium text-on-surface">
          {fullName(profile)}
        </span>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      render: (profile) => (
        <span className="whitespace-nowrap text-on-surface-variant">
          {new Date(profile._creationTime).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "mentorship",
      header: "Mentorship Proof",
      render: (profile) =>
        profile.mentorshipProofUrl ? (
          <Badge variant="verified">Uploaded</Badge>
        ) : (
          <Badge variant="pending">
            Missing
          </Badge>
        ),
    },
    {
      key: "sex",
      header: "Sex",
      render: (profile) => (
        <span className="capitalize text-on-surface-variant">
          {profile.sex}
        </span>
      ),
    },
    {
      key: "marital",
      header: "Marital",
      render: (profile) => (
        <span className="capitalize text-on-surface-variant">
          {profile.maritalStatus}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Pending Verifications
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Review submitted profiles and approve membership.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-surface-low p-1">
          <Button
            type="button"
            variant={mode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("list")}
          >
            List
          </Button>
          <Button
            type="button"
            variant={mode === "review" ? "secondary" : "ghost"}
            size="sm"
            disabled={filteredIds.length === 0}
            onClick={() => setMode("review")}
          >
            Review mode
          </Button>
        </div>

        {mode === "list" && (
          <SearchInput
            defaultValue={search}
            onDebouncedChange={setSearch}
            placeholder="Search by name…"
            className="max-w-md"
          />
        )}
      </div>

      {mode === "list" ? (
        <DataTable<PendingProfile>
          columns={columns}
          rows={filtered}
          rowKey={(profile) => profile._id}
          onRowClick={(profile) =>
            router.push(`/admin/verification/${profile._id}`)
          }
          empty={
            <EmptyState
              title="Nothing waiting for review"
              message="No pending profiles match your search."
            />
          }
        />
      ) : (
        <ReviewMode profileIds={filteredIds} onExit={() => setMode("list")} />
      )}
    </div>
  );
}