"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Users } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/shadcn/badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";

// Row shape comes straight from the Convex query — no hand-rolled drift.
type PendingProfile = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.listPendingVerifications>
>[number];

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function VerificationClient() {
  const router = useRouter();
  const pending = useAuthQuery(api.memberProfiles.listPendingVerifications);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!pending) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) => fullName(p).toLowerCase().includes(q));
  }, [pending, search]);

  const columns: Column<PendingProfile>[] = [
    {
      key: "name",
      header: "Name",
      render: (profile) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-on-surface">
            {fullName(profile)}
          </span>
          {!profile.mentorshipProofUrl && (
            <Badge variant="pending">
              <PhoneCall className="mr-1 size-3" aria-hidden="true" />
              Needs follow-up
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: (profile) => (
        <span className="text-on-surface-variant">{profile.phone ?? "—"}</span>
      ),
    },
    {
      key: "mentorship",
      header: "Mentorship",
      render: (profile) => (
        <Badge variant="neutral" className="capitalize">
          {profile.mentorshipStatus.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "children",
      header: "Children",
      render: (profile) => (
        <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
          <Users className="size-3.5" aria-hidden="true" />
          <span className="font-mono">{profile.children.length}</span>
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

      <SearchInput
        defaultValue={search}
        onDebouncedChange={setSearch}
        placeholder="Search by name…"
        className="max-w-md"
      />

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
    </div>
  );
}
