"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

// Desktop admin top bar (adapted from INTERFACE_SPEC §2.1 for web): glass-light
// parchment, wordmark left, signed-in identity + role badge + sign-out right.
// No bottom tabs, no mobile chrome.
export function AdminHeader() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 h-14 bg-parchment/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <span className="font-display text-md font-bold text-primary">
          KLT Cyber Church
        </span>

        <div className="flex items-center gap-4">
          {!isPending && session?.user?.email && (
            <span className="hidden font-body text-sm text-on-surface-variant sm:inline">
              {session.user.email}
            </span>
          )}
          <RoleBadge />
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

// In Increment 1 every authenticated account is a visitor (see
// docs/DATA_MODEL.md). The base role isn't yet exposed through a Convex query,
// so the badge reflects that known state.
function RoleBadge() {
  return (
    <span className="rounded-full bg-royal-light px-2.5 py-0.5 font-body text-xs font-semibold text-royal">
      Visitor
    </span>
  );
}
