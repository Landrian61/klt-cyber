import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await fetchAuthQuery(api.profile.getMyAccount);
  if (!account) redirect("/sign-in");

  const { activeRoles, hasAdministrationAccess } = account;
  if (!hasAdministrationAccess) {
    redirect(activeRoles.length > 0 ? "/areas-of-service" : "/unauthorized");
  }

  return (
    <div
      data-section="admin"
      className="flex h-dvh overflow-hidden bg-background"
    >
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopBar />
        <main className="w-full min-w-0 flex-1 overflow-y-auto px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
