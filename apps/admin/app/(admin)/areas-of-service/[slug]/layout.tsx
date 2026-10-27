import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
import { ErrorState } from "@/components/ui/ErrorState";
import { DepartmentShellProvider } from "@/components/department/DepartmentShellProvider";
import { isPausedSlug } from "@/lib/departmentRoutes";
import { DepartmentSidebar } from "./DepartmentSidebar";
import { DepartmentTopBar } from "./DepartmentTopBar";

/**
 * The shared department portal (spec 0012).
 *
 * This layout hosts the five shell pages for every active department that has
 * no bespoke portal of its own. The gate runs here, server side, so an
 * unauthorised caller is redirected before anything renders; the same query
 * then runs as a live subscription inside `DepartmentShellProvider`, which is
 * what catches a role lost or a sign-out while a page is still mounted.
 *
 * `getShellContext` resolves to null for an unknown slug, a paused department,
 * and a caller with no role in this department (a plain roster member included)
 * — all of which land back on the hub.
 */
export default async function DepartmentShellLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // A paused department never enters the shell: no chrome, no gate, just its
  // own "Coming soon" page, which does its own access check (AC-1).
  if (isPausedSlug(slug)) return <>{children}</>;

  let shell;
  try {
    shell = await fetchAuthQuery(api.departmentShell.getShellContext, { slug });
  } catch {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-low">
        <ErrorState cause="offline" />
      </div>
    );
  }
  if (!shell) redirect("/areas-of-service");

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

  const { user } = account;
  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <DepartmentShellProvider slug={slug}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <DepartmentSidebar
          slug={slug}
          departmentName={shell.department.name}
          can={shell.can}
        />
        <SidebarInset className="bg-surface-low">
          <DepartmentTopBar
            slug={slug}
            departmentName={shell.department.name}
            iconKey={shell.iconKey}
            role={shell.role}
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
