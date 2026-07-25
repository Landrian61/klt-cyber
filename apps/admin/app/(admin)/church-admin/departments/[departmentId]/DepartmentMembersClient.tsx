"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Card, Button } from "../../ui";

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

  const departments = useAuthQuery(api.departments.listActiveDepartments);
  const members = useAuthQuery(api.memberProfiles.listVerifiedMembersWithRoles);

  const department = departments?.find((d) => d._id === id);

  // listVerifiedMembersWithRoles already returns each member's departmentId —
  // no dedicated "members by department" query exists (or is needed), so we
  // filter the full verified-member list client-side.
  const departmentMembers = useMemo(() => {
    if (!members) return undefined;
    return members.filter((m) => m.profile.departmentId === id);
  }, [members, id]);

  if (departments !== undefined && !department) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/church-admin/departments")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm text-muted-foreground">
          This department is inactive or doesn&apos;t exist.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/church-admin/departments")}
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
          {department?.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {department.description}
            </p>
          )}
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
            {departmentMembers === undefined &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3" colSpan={4}>
                    <div className="h-5 w-full animate-pulse rounded-md bg-muted" />
                  </td>
                </tr>
              ))}

            {departmentMembers?.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No verified members belong to this department yet.
                </td>
              </tr>
            )}

            {departmentMembers?.map(({ profile }) => (
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
      </Card>
    </div>
  );
}
