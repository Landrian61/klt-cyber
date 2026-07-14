"use client";

import { useState } from "react";
import Image from "next/image";
import { authClient } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

// Desktop admin top bar (adapted from INTERFACE_SPEC §2.1 for web): glass-light
// parchment, wordmark left, signed-in identity + role badge + sign-out right.
// No bottom tabs, no mobile chrome.
export function AdminHeader() {
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    // Hard navigation on purpose — see SystemAdminTopBar.handleSignOut.
    window.location.assign("/sign-in");
  }

  return (
    <header className="sticky top-0 z-10 h-14 bg-parchment/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <span className="flex items-center gap-2.5">
          <Image
            src="/klt-logo.png"
            alt="KLT Cyber Church"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-md object-cover"
          />
          <span className="font-body text-sm font-semibold text-on-surface">
            Admin Portal
          </span>
        </span>

        <div className="flex items-center gap-4">
          {!isPending && session?.user?.email && (
            <span className="hidden font-body text-sm text-on-surface-variant sm:inline">
              {session.user.email}
            </span>
          )}
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
    </header>
  );
}
