"use client";

import { useMemo, useState } from "react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { CardGrid, ContentCard, formatDateTime } from "../_lib/adminContent";
import { EventDialog, type Event } from "./EventDialog";

type Tab = "upcoming" | "past";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

export function EventsClient() {
  const events = useAuthQuery(api.events.listAllEvents, {});

  const [tab, setTab] = useState<Tab>("upcoming");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  const { upcoming, past } = useMemo(() => {
    if (!events) return { upcoming: undefined, past: undefined };
    const now = Date.now();
    const visible = events.filter((event) => event.active);
    return {
      upcoming: visible
        .filter((event) => event.startDateTime >= now)
        .sort((a, b) => a.startDateTime - b.startDateTime),
      past: visible
        .filter((event) => event.startDateTime < now)
        .sort((a, b) => b.startDateTime - a.startDateTime),
    };
  }, [events]);

  const shown = tab === "upcoming" ? upcoming : past;

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(event: Event) {
    setEditing(event);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Events
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          One-off events, shown separately from the weekly schedule on mobile.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          options={TAB_OPTIONS}
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          ariaLabel="Upcoming or past events"
        />
        <Button size="sm" onClick={openNew}>
          Add event
        </Button>
      </div>

      {!shown ? (
        <CardGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-md bg-surface-lowest"
            />
          ))}
        </CardGrid>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "upcoming" ? "No upcoming events" : "No past events"}
          message={
            tab === "upcoming"
              ? "Add an event and it will show here once it's on."
              : "Events move here automatically once their date has passed."
          }
        />
      ) : (
        <CardGrid>
          {shown.map((event) => (
            <ContentCard
              key={event._id}
              coverImageUrl={event.coverImageUrl}
              title={event.title}
              meta={`${formatDateTime(event.startDateTime)}${
                event.location ? ` · ${event.location}` : ""
              }`}
              marker={event.featured ? "★" : undefined}
              onClick={() => openEdit(event)}
            />
          ))}
        </CardGrid>
      )}

      <EventDialog open={open} onOpenChange={setOpen} event={editing} />
    </div>
  );
}
