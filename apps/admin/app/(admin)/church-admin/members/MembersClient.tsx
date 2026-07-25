"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Card, Input, Badge } from "../ui";

const ROLE_LABELS: Record<string, string> = {
  system_admin: "System Admin",
  church_admin: "Church Admin",
  clan_elder: "Clan Elder",
};

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function MembersClient() {
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!members) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => fullName(m.profile).toLowerCase().includes(q));
  }, [members, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified members. Roles shown are administrative assignments only
            (System Admin, Church Admin, Clan Elder) — most members won&apos;t
            have one.
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
              <th className="px-4 py-3 font-medium">Occupation</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Admin Roles</th>
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
                  No verified members match your search.
                </td>
              </tr>
            )}

            {filtered?.map(({ profile, activeRoles }) => (
              <tr
                key={profile._id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-medium">{fullName(profile)}</td>
                <td className="px-4 py-3">{profile.phone ?? "—"}</td>
                <td className="px-4 py-3">{profile.occupation ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {profile.joinDate
                    ? new Date(profile.joinDate).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {activeRoles.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {activeRoles.map((role) => (
                        <Badge key={role._id} variant="secondary">
                          {ROLE_LABELS[role.roleType] ?? role.roleType}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
