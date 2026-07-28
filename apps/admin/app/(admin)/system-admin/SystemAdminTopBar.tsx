"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth";
import { Avatar } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { SidebarTrigger } from "@/components/shadcn/sidebar";

// Top bar spanning the content column (right of the sidebar). Floating chrome
// per the Glass & Gold rule: lifted-parchment glass with an ambient shadow —
// tonally distinct from the page, no border line. Right side is the acting
// identity (avatar, name, role caption) and sign-out; the left shows the
// module title only while the sidebar is collapsed to icons (below lg) —
// at lg+ the sidebar label and the page's own heading already say where
// you are, so repeating it here would be noise.

const MODULE_TITLES: [prefix: string, title: string][] = [
  ["/system-admin/users", "Users"],
  ["/system-admin/activity", "Activity"],
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

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    // Hard navigation on purpose: a client-side push + refresh races the
    // collapsing auth state inside the App Router cache (headCacheNode
    // crash) and would keep signed-in RSC payloads cached. A full load
    // tears both down.
    window.location.assign("/sign-in");
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 bg-surface-lowest/85 px-6 shadow-[0_8px_32px_rgba(28,28,24,0.06)] backdrop-blur-xl lg:px-10">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1 text-on-surface-variant hover:bg-surface-low hover:text-primary" />
        <p className="min-w-0 truncate font-body text-base font-semibold text-on-surface lg:hidden">
          {moduleTitle(pathname)}
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        <span className="flex items-center gap-2.5">
          <Avatar name={name} email={email} src={avatarUrl} size="md" />
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-48 truncate font-body text-sm font-medium text-on-surface">
              {name ?? email}
            </span>
            <span className="block font-body text-xs text-on-surface-variant">
              System Administrator
            </span>
          </span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSignOut}
          loading={signingOut}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
