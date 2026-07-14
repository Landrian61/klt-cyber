import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { SystemAdminSidebar } from "./SystemAdminSidebar";
import { SystemAdminTopBar } from "./SystemAdminTopBar";

// Role-scoped shell for the system_admin URL prefix (docs/DATA_MODEL.md's
// URL-scoped role context pattern): full-height sidebar on the left, top bar
// spanning the content column. Server-verifies the active role on every
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

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

  return (
    <div className="flex min-h-dvh bg-parchment">
      <SystemAdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <SystemAdminTopBar
          name={fullName}
          email={user.email}
          avatarUrl={user.profilePictureUrl ?? null}
        />
        <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-6 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
