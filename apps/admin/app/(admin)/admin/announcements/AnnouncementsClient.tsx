"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { CardGrid, ContentCard, PriorityBadge } from "../_lib/adminContent";
import { AnnouncementDialog, type Announcement } from "./AnnouncementDialog";

type Status = "draft" | "published" | "archived";

const TAB_OPTIONS: { value: Status; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const EMPTY_COPY: Record<Status, { title: string; message: string }> = {
  draft: {
    title: "No draft announcements",
    message: "Announcements you're still writing land here.",
  },
  published: {
    title: "No published announcements",
    message: "Publish a draft to put it in front of the church.",
  },
  archived: {
    title: "No archived announcements",
    message: "Archived announcements stay here, still editable.",
  },
};

export function AnnouncementsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth — shareable, bookmarkable tab state.
  const tabParam = searchParams.get("tab");
  const tab: Status =
    tabParam === "published" || tabParam === "archived" ? tabParam : "draft";

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "draft") params.delete("tab");
      else params.set("tab", value);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const announcements = useAuthQuery(api.announcements.listAllAnnouncements, {});

  const filtered = useMemo(
    () => announcements?.filter((a) => a.status === tab),
    [announcements, tab],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="xl">
          Announcements
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Church-wide notices shown on the mobile app&rsquo;s updates feed.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          ariaLabel="Announcement status"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />
        <Button size="sm" onClick={openNew}>
          Add announcement
        </Button>
      </div>

      {!announcements ? (
        <CardGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-md" />
          ))}
        </CardGrid>
      ) : filtered && filtered.length > 0 ? (
        <CardGrid>
          {filtered.map((a) => (
            <ContentCard
              key={a._id}
              coverImageUrl={a.coverImageUrl}
              title={a.title}
              meta={a.category ?? "General"}
              badges={<PriorityBadge priority={a.priority} />}
              onClick={() => openEdit(a)}
            />
          ))}
        </CardGrid>
      ) : (
        <EmptyState title={EMPTY_COPY[tab].title} message={EMPTY_COPY[tab].message} />
      )}

      <AnnouncementDialog open={open} onOpenChange={setOpen} announcement={editing} />
    </div>
  );
}
