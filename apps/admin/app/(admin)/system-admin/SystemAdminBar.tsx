"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

// Section-scoped context bar for the system_admin portal: who's acting, in
// which role, and the way back out. Sits below the global AdminHeader.
export function SystemAdminBar({ name }: { name: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-low px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="font-body text-sm font-medium text-on-surface">{name}</span>
        <span className="rounded-full bg-primary-light px-2.5 py-0.5 font-body text-xs font-semibold text-primary">
          System Administrator
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/select-role"
          className="font-body text-sm font-medium text-primary underline underline-offset-2"
        >
          Switch role
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSignOut}
          loading={signingOut}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
