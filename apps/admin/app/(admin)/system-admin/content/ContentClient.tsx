"use client";

import { useState } from "react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { ThemesManager } from "./ThemesManager";
import { EventsManager } from "./EventsManager";
import { AnnouncementsManager } from "./AnnouncementsManager";

type Tab = "themes" | "events" | "announcements";

const TABS: { key: Tab; label: string }[] = [
  { key: "themes", label: "Themes" },
  { key: "events", label: "Events" },
  { key: "announcements", label: "Announcements" },
];

export function ContentClient() {
  const access = useAuthQuery(api.content.getMyContentAccess, {});
  const [tab, setTab] = useState<Tab>("themes");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Content
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Manage the theme, events, and announcements members see on the Home tab. Weekly
          programs are managed under Administration → Weekly program.
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
        <>
          <div
            role="tablist"
            aria-label="Content types"
            className="flex flex-wrap gap-1 border-b border-outline/15"
          >
            {TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <button
                  key={entry.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(entry.key)}
                  className={cn(
                    "relative -mb-px h-10 px-4 font-body text-sm font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {entry.label}
                  {active && (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {tab === "themes" && <ThemesManager />}
          {tab === "events" && <EventsManager />}
          {tab === "announcements" && <AnnouncementsManager />}
        </>
      )}
    </div>
  );
}
