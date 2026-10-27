import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
import { ErrorState } from "@/components/ui/ErrorState";
import { DepartmentShellProvider } from "@/components/department/DepartmentShellProvider";
import { MediaSidebar } from "./MediaSidebar";
import { MediaTopBar } from "./MediaTopBar";

export default async function MediaLayout({
  children,
}: {
  children: ReactNode;
}) {
  let account;
  try {
    account = await fetchAuthQuery(api.profile.getMyAccount);
  } catch {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-low">
        <ErrorState cause="offline" />
      </div>
    );
  }
  if (!account) redirect("/sign-in");

  const { user, activeRoles, hasMediaAccess } = account;
  if (!hasMediaAccess) {
    redirect(activeRoles.length > 0 ? "/areas-of-service" : "/unauthorized");
  }

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    // Media mounts the shared shell pages (Roster, Activities, Messages,
    // Settings) inside its own portal, so it needs the same context those
    // components read their department and capabilities from (spec 0012, AC-3).
    //
    // The context resolves to null for a plain Media roster member, who has
    // portal access to Media's own Devotionals and Past events but no shell
    // pages. Those pages do not read the context, so they keep working; a shell
    // page reached by typing its URL sends such a caller back to the hub.
    <DepartmentShellProvider slug="media">
      <SidebarProvider defaultOpen={defaultOpen}>
        <MediaSidebar />
        <SidebarInset className="bg-surface-low">
          <MediaTopBar
            name={fullName}
            email={user.email}
            avatarUrl={user.profilePictureUrl ?? null}
          />
          <div className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </DepartmentShellProvider>
  );
}
