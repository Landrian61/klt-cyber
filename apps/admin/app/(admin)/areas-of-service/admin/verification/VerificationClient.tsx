"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { REVIEWER_NAME } from "@klt-cyber/shared";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs";
import { ReviewMode } from "./ReviewMode";
import { fullName } from "./shared";

// Row shapes come straight from the Convex queries — no hand-rolled drift.
type PendingProfile = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listPendingVerifications>
>[number];

type SentBackProfile = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listSentBack>
>[number];

export function VerificationClient() {
  const router = useRouter();
  const pending = useAuthQuery(api.memberProfiles.listPendingVerifications);
  const sentBack = useAuthQuery(api.memberProfiles.listSentBack);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "review">("list");

  // Both lists arrive sorted oldest-first by the time the row entered its
  // current state, so the longest wait is at the top. The sort lives in the
  // query, not here, so every reader gets the same order.
  const filtered = useMemo(() => {
    if (!pending) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) => fullName(p).toLowerCase().includes(q));
  }, [pending, search]);

  const filteredSentBack = useMemo(() => {
    if (!sentBack) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return sentBack;
    return sentBack.filter((p) => fullName(p).toLowerCase().includes(q));
  }, [sentBack, search]);

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
      key: "round",
      header: "Round",
      // Derived in the query, never stored (AC-5): a `pending_verification`
      // row with `sentBackAt` set has been round the loop at least once, so
      // nothing can disagree with the row.
      render: (profile) =>
        profile.isResubmission ? (
          <Badge variant="neutral">
            <Undo2 className="mr-1 size-3" aria-hidden="true" />
            Resubmitted
          </Badge>
        ) : (
          <span className="text-on-surface-variant">First</span>
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

  const sentBackColumns: Column<SentBackProfile>[] = [
    {
      key: "photo",
      header: "Photo",
      render: (profile) => (
        <Avatar
          name={fullName(profile)}
          src={profile.photoUrl ?? undefined}
          size="md"
        />
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
      key: "sentBackAt",
      header: "Sent back",
      render: (profile) => (
        <span className="whitespace-nowrap font-mono text-on-surface-variant">
          {new Date(profile.sentBackAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "sentBackBy",
      header: "By",
      render: (profile) => (
        <span className="text-on-surface-variant">
          {profile.sentBackByName ?? "—"}
        </span>
      ),
    },
    {
      key: "reason",
      header: "What was asked for",
      render: (profile) => (
        <span className="text-on-surface-variant">
          {profile.sentBackReason ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Verifications
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Review submitted profiles, and keep an eye on the ones you have sent
          back.
        </p>
      </header>

      {/* Two lists, not one filter. These are waiting on different people: a
          reviewer scanning for work they can actually do should not have to
          read past the ones they have already answered (AC-8). */}
      <Tabs defaultValue="queue">
        <TabsList variant="line">
          <TabsTrigger value="queue">
            Waiting on review
            {pending ? ` (${pending.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="sent-back">
            Sent back
            {sentBack ? ` (${sentBack.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-6">
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
                router.push(
                  `/areas-of-service/admin/verification/${profile._id}`,
                )
              }
              empty={
                <EmptyState
                  title="Nothing waiting for review"
                  message="No pending profiles match your search."
                />
              }
            />
          ) : (
            <ReviewMode
              profileIds={filteredIds}
              onExit={() => setMode("list")}
            />
          )}
        </TabsContent>

        <TabsContent value="sent-back" className="space-y-6">
          <DataTable<SentBackProfile>
            columns={sentBackColumns}
            rows={filteredSentBack}
            rowKey={(profile) => profile._id}
            onRowClick={(profile) =>
              router.push(`/areas-of-service/admin/verification/${profile._id}`)
            }
            empty={
              // An empty list here is the normal, healthy case, so it reads as
              // "nothing is waiting on anybody" rather than as a failure.
              <EmptyState
                title="Nothing is waiting on anyone"
                message={`No profile is sitting with its owner. Everything ${REVIEWER_NAME} has asked for has come back.`}
              />
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}