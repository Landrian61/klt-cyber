"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Search, Users } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Card, Input, Badge } from "../ui";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Pending Verifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review submitted profiles and approve membership.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Mentorship</th>
              <th className="px-4 py-3 font-medium">Children</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {filtered === undefined &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3" colSpan={5}>
                    <div className="h-5 w-full animate-pulse rounded-md bg-muted" />
                  </td>
                </tr>
              ))}

            {filtered?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No pending profiles match your search.
                </td>
              </tr>
            )}

            {filtered?.map((profile) => {
              const needsFollowUp = !profile.mentorshipProofUrl;
              return (
                <tr
                  key={profile._id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                  onClick={() =>
                    router.push(`/church-admin/verification/${profile._id}`)
                  }
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {fullName(profile)}
                      {needsFollowUp && (
                        <Badge variant="destructive" className="gap-1">
                          <PhoneCall className="h-3 w-3" />
                          Needs follow-up
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{profile.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="capitalize">
                      {profile.mentorshipStatus.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {profile.children.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(profile._creationTime).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
