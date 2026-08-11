"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Card, Button, Input } from "../../ui";
import { downloadCsv } from "../../csv";

const PAGE_SIZE = 10;

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function DepartmentMembersClient({
  departmentId,
}: {
  departmentId: string;
}) {
  const router = useRouter();
  const id = departmentId as Id<"departments">;

  const departments = useAuthQuery(api.departments.listDepartments);
  const membership = useAuthQuery(api.departmentMemberships.listDepartmentMembers, {
    departmentId: id,
  });
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const department = departments?.find((d) => d._id === id);

  const profileByUserId = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof members>[number]["profile"]
    >();
    members?.forEach((m) => map.set(m.profile.userId, m.profile));
    return map;
  }, [members]);

  // listDepartmentMembers only returns bare membership rows (userId, no
  // name/phone/occupation) — join against the verified-members map to get
  // displayable profile fields. Rows whose userId isn't found are skipped.
  const departmentMembers = useMemo(() => {
    if (!membership || !members) return undefined;
    const q = search.trim().toLowerCase();
    const joined = membership
      .map((m) => profileByUserId.get(m.userId))
      .filter((profile): profile is NonNullable<typeof profile> => !!profile);
    return joined.filter((profile) => !q || fullName(profile).toLowerCase().includes(q));
  }, [membership, members, profileByUserId, search]);

  const totalPages = departmentMembers
    ? Math.max(1, Math.ceil(departmentMembers.length / PAGE_SIZE))
    : 1;
  const clampedPage = Math.min(page, totalPages);
  const paginated = departmentMembers?.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleExport() {
    if (!departmentMembers) return;
    downloadCsv(
      `${department?.name ?? "department"}-members.csv`,
      ["Name", "Phone", "Occupation", "Joined"],
      departmentMembers.map((profile) => [
        fullName(profile),
        profile.phone ?? "",
        profile.occupation ?? "",
        profile.joinDate ? new Date(profile.joinDate).toLocaleDateString() : "",
      ]),
    );
  }

  if (departments !== undefined && !department) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/departments")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm text-muted-foreground">
          This department doesn&apos;t exist.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/departments")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-display text-2xl font-semibold">
              {department ? (
                department.name
              ) : (
                <span className="inline-block h-7 w-40 animate-pulse rounded-md bg-muted align-middle" />
              )}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!departmentMembers || departmentMembers.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
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
            </tr>
          </thead>
          <tbody>
            {paginated === undefined &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3" colSpan={4}>
                    <div className="h-5 w-full animate-pulse rounded-md bg-muted" />
                  </td>
                </tr>
              ))}

            {paginated?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No verified members match your search.
                </td>
              </tr>
            )}

            {paginated?.map((profile) => (
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
              </tr>
            ))}
          </tbody>
        </table>

        {departmentMembers && departmentMembers.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <p>
              Showing {(clampedPage - 1) * PAGE_SIZE + 1}–
              {Math.min(clampedPage * PAGE_SIZE, departmentMembers.length)} of{" "}
              {departmentMembers.length} results
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={clampedPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-foreground">
                Page {clampedPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={clampedPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
