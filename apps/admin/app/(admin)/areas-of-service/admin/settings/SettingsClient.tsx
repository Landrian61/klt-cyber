"use client";

import { Heading } from "@/components/ui/Heading";
import { AccountPanel } from "@/components/account/AccountPanel";

/**
 * Administration's own settings page.
 *
 * The account and member-details editor it used to hold now lives in
 * `components/account/AccountPanel.tsx`, because the shared department shell's
 * Settings page needs exactly the same thing (spec 0012, AC-9) and a person's
 * account is not department scoped. Both pages render that one panel.
 */
export function SettingsClient() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Settings
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Manage your own contact and professional details.
        </p>
      </header>

      <AccountPanel />
    </div>
  );
}
