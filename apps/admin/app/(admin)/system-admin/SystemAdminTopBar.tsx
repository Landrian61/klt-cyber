"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

// Top bar spanning the content column (right of the sidebar): where the admin
// is (breadcrumb, left) and who they are (identity + role badge + sign out,
// right). Glass-light parchment per INTERFACE_SPEC §2.1, adapted for web.

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
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 bg-parchment/80 px-6 backdrop-blur-xl lg:px-8">
      <p className="min-w-0 truncate font-body text-sm text-on-surface-variant">
        <span className="hidden sm:inline">System Admin</span>
        <span aria-hidden="true" className="hidden px-2 text-outline sm:inline">
          /
        </span>
        <span className="font-semibold text-on-surface">
          {moduleTitle(pathname)}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-4">
        <span className="hidden rounded-full bg-primary-light px-2.5 py-0.5 font-body text-xs font-semibold text-primary md:inline">
          System Administrator
        </span>
        <span className="flex items-center gap-2.5">
          <Avatar name={name} email={email} src={avatarUrl} size="sm" />
          <span className="hidden max-w-44 truncate font-body text-sm font-medium text-on-surface sm:inline">
            {name ?? email}
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
