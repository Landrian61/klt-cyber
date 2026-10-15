import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
import { ErrorState } from "@/components/ui/ErrorState";
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
    <SidebarProvider defaultOpen={defaultOpen}>
      <MediaSidebar />
      <SidebarInset className="bg-surface-low">
        <MediaTopBar
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
