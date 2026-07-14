import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { SystemAdminBar } from "./SystemAdminBar";

// Role-scoped shell for the system_admin URL prefix (docs/DATA_MODEL.md's
// URL-scoped role context pattern). Server-verifies the active role on every
// render — the middleware invariant only proves ≥1 role, not which one.
export default async function SystemAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, activeRoles } = await fetchAuthQuery(api.profile.getMyAccount);
  const isSystemAdmin = activeRoles.some((role) => role.roleType === "system_admin");

  if (!isSystemAdmin) {
    redirect(activeRoles.length > 0 ? "/select-role" : "/unauthorized");
  }

  return (
    <div>
      <SystemAdminBar name={user.firstName ?? user.email} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
