"use client";

import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { ThemesManager } from "./ThemesManager";

// Weekly programs, events, and announcements moved to their own pages under
// Administration (consolidated off this route's parallel Sheet-based forms).
// Themes is the one surface with no Administration-side equivalent yet, so
// this page is just Themes now — no tab bar for a single destination.
export function ContentClient() {
  const access = useAuthQuery(api.content.getMyContentAccess, {});

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Content
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Manage the annual/monthly theme members see on the Home tab. Weekly programs,
          events, and announcements are managed under Administration.
        </p>
      </header>

      {access === undefined ? (
        <p className="font-body text-sm text-outline">Checking access…</p>
      ) : !access.canManage ? (
        <EmptyState
          title="You don't have content access"
          message="Content management is limited to allow-listed administrators (CONTENT_ADMIN_AUTH_IDS). Ask a system administrator to add your account."
        />
      ) : (
        <ThemesManager />
      )}
    </div>
  );
}
