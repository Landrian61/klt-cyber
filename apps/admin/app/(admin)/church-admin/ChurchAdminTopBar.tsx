"use client";

import { Bell, Settings } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";

export function ChurchAdminTopBar() {
  const account = useAuthQuery(api.profile.getMyAccount);
  const name = account?.user
    ? [account.user.firstName, account.user.lastName]
        .filter(Boolean)
        .join(" ") || account.user.email
    : undefined;

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border px-8">
      <div className="ml-auto flex items-center gap-4">
        {/* Decorative — no notifications/settings backend exists yet. */}
        <button
          type="button"
          disabled
          className="rounded-full p-2 text-muted-foreground opacity-50"
          aria-label="Notifications (not yet available)"
        >
          <Bell className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          disabled
          className="rounded-full p-2 text-muted-foreground opacity-50"
          aria-label="Settings (not yet available)"
        >
          <Settings className="h-4.5 w-4.5" />
        </button>

        {name ? (
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <p className="font-medium leading-none">{name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                Church Admin
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold uppercase text-[var(--color-on-primary)]">
              {name.charAt(0)}
            </div>
          </div>
        ) : (
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        )}
      </div>
    </header>
  );
}
