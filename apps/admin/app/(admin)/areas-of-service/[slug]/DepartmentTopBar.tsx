"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { SidebarTrigger } from "@/components/shadcn/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { DepartmentSwitcher } from "@/components/admin/DepartmentSwitcher";

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  roster: "Roster",
  activities: "Activities",
  messages: "Messages",
  settings: "Settings",
};

const ROLE_LABELS: Record<string, string> = {
  hod: "HOD",
  delegate: "Delegate",
  system_admin: "System Admin",
};

export function DepartmentTopBar({
  slug,
  departmentName,
  iconKey,
  role,
  name,
  email,
  avatarUrl,
}: {
  slug: string;
  departmentName: string;
  iconKey: string;
  role: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const displayName = name ?? email;

  // The page title comes from the segment after the slug. The URL is the one
  // source of truth for where you are and which department you are acting on
  // (AC-4), so nothing here is kept in state.
  const segment = pathname.split(`/areas-of-service/${slug}/`)[1]?.split("/")[0];
  const title = (segment && PAGE_TITLES[segment]) ?? departmentName;

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 bg-parchment/85 pl-1.5 pr-3 shadow-header backdrop-blur-xl lg:pl-2 lg:pr-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="size-8 text-on-surface-variant hover:bg-surface-low hover:text-primary" />
        {/* Switching departments is a navigation, never a stored "current
            department" — the slug in the URL is the authority. The switcher's
            trigger carries this department's own fixed icon, which is where a
            department identifies itself now that every rail shows the KLT
            mark (spec 0012, AC-7). */}
        <DepartmentSwitcher current={departmentName} iconKey={iconKey} />
        <p className="min-w-0 truncate font-body text-base font-semibold text-on-surface lg:hidden">
          {title}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Notifications"
          className="flex size-9 items-center justify-center rounded-full border border-border text-on-surface-variant outline-none transition-colors hover:bg-surface-low hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="shrink-0 rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-parchment"
            >
              <Avatar
                variant="gradient"
                name={name}
                email={email}
                src={avatarUrl}
                size="md"
              />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-3 py-2.5">
              <Avatar
                variant="gradient"
                name={name}
                email={email}
                src={avatarUrl}
                size="md"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-body text-sm font-semibold text-on-surface">
                  {displayName}
                </span>
                <span className="truncate font-body text-xs font-normal text-on-surface-variant">
                  {email}
                </span>
              </span>
            </DropdownMenuLabel>

            <div className="px-2 pb-1.5">
              <Badge variant="role">
                {departmentName} · {ROLE_LABELS[role] ?? role}
              </Badge>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              disabled={signingOut}
              onSelect={(event) => {
                event.preventDefault();
                handleSignOut();
              }}
            >
              <LogOut aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
