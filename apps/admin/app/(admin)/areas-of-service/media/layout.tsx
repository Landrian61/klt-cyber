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

  const { user, activeRoles, hasMediaAccess, hasRadioAccess } = account;
  // Two doors into one portal (spec 0019): Media's leaders publish content,
  // and every `manageRadio` holder, the verified roster included, runs the
  // radio. Devotionals and Past events check `hasMediaAccess` again in their
  // own layouts, so entering here never widens who may publish.
  if (!hasMediaAccess && !hasRadioAccess) {
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
    // The context resolves to a `roster` role for a verified Media roster
    // member, whose `can` holds `manageRadio` and no shell capability, so the
    // shared pages that need one turn them away and the Radio page lets them
    // in. It resolves to null for anyone with no role here at all, whom the
    // gate above has already turned away; that branch is belt and braces.
    <DepartmentShellProvider slug="media">
      <SidebarProvider defaultOpen={defaultOpen}>
        <MediaSidebar />
        <SidebarInset className="bg-surface-low">
          <MediaTopBar
            name={fullName}
            email={user.email}
            avatarUrl={account.photoUrl}
          />
          <div className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </DepartmentShellProvider>
  );
}
