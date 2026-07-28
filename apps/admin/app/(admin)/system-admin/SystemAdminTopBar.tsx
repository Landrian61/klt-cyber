"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Repeat } from "lucide-react";
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

// Top bar spanning the content column. Floating parchment glass, tonally lifted
// above the (deeper) page. The acting identity collapses into a click-to-open
// account menu on the right (mobile-styled gold avatar); the left shows the
// module title only while the sidebar is collapsed below lg.

const MODULE_TITLES: [prefix: string, title: string][] = [
  ["/system-admin/users", "Users"],
  ["/system-admin/activity", "Activity"],
  ["/system-admin/content", "Content"],
  ["/system-admin", "Dashboard"],
];

function moduleTitle(pathname: string): string {
  const match = MODULE_TITLES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1] ?? "Dashboard";
}

export function SystemAdminTopBar({
  name,
  email,
  avatarUrl,
}: {
  /** Full name for avatar initials; null lets the email drive them. */
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const displayName = name ?? email;

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    // Hard navigation on purpose: a client-side push + refresh races the
    // collapsing auth state inside the App Router cache (headCacheNode crash)
    // and would keep signed-in RSC payloads cached. A full load tears both down.
    window.location.assign("/sign-in");
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 bg-surface-lowest/80 px-4 shadow-[0_10px_30px_-18px_rgba(28,28,24,0.35)] backdrop-blur-xl lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1 text-on-surface-variant hover:bg-surface-low hover:text-primary" />
        <p className="min-w-0 truncate font-body text-base font-semibold text-on-surface lg:hidden">
          {moduleTitle(pathname)}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-1.5 outline-none transition-colors hover:bg-surface-low focus-visible:ring-2 focus-visible:ring-primary sm:pr-2.5"
          >
            <Avatar
              variant="gradient"
              name={name}
              email={email}
              src={avatarUrl}
              size="md"
            />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-40 truncate font-body text-sm font-semibold text-on-surface">
                {displayName}
              </span>
              <span className="block font-body text-xs text-on-surface-variant">
                System Administrator
              </span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-outline sm:block" aria-hidden="true" />
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
            <Badge variant="role">System Administrator</Badge>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/select-role">
              <Repeat aria-hidden="true" />
              Switch role
            </Link>
          </DropdownMenuItem>

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
    </header>
  );
}
