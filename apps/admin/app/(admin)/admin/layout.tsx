import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";

// Administration's shell — the same structure as the system_admin one so both
// portals read as one product: shadcn SidebarProvider owns the collapse state,
// seeded from the sidebar_state cookie so the server renders the correct width
// with no flash. Server-verifies Administration authority on every render;
// middleware only proves >=1 role, not which one.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await fetchAuthQuery(api.profile.getMyAccount);
  if (!account) redirect("/sign-in");

  const { user, activeRoles, hasAdministrationAccess } = account;
  if (!hasAdministrationAccess) {
    redirect(activeRoles.length > 0 ? "/areas-of-service" : "/unauthorized");
  }

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar />
      {/* Deeper warm-parchment page so the white cards and glass top bar lift. */}
      <SidebarInset className="bg-surface-low">
        <AdminTopBar
          name={fullName}
          email={user.email}
          avatarUrl={user.profilePictureUrl ?? null}
        />
        <div className="w-full min-w-0 flex-1 px-6 py-8 lg:px-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
