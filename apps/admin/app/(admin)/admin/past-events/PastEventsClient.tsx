"use client";

import { useMemo, useState } from "react";
import { ImageOff, Pencil, Play, Plus, Search } from "lucide-react";
import {
  dateKeyFromMs,
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "@klt-cyber/shared";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, fromDateInput } from "../_lib/adminContent";
import {
  MockDataNotice,
  usePastEventList,
  type PastEvent,
} from "../_lib/mediaContentData";
import { PastEventDialog } from "./PastEventDialog";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md bg-white px-4 py-3">
      <p className="font-body text-[11px] uppercase tracking-wide text-outline">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-on-surface">
        {value}
      </p>
      {hint && (
        <p className="font-body text-xs text-on-surface-variant">{hint}</p>
      )}
    </div>
  );
}

export function PastEventsClient() {
  const pastEvents = usePastEventList();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PastEvent | null>(null);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("all");

  const thisYear = dateKeyFromMs(Date.now()).slice(0, 4);

  const years = useMemo(
    () =>
      [...new Set((pastEvents ?? []).map((e) => e.date.slice(0, 4)))].sort(
        (a, b) => b.localeCompare(a),
      ),
    [pastEvents],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(pastEvents ?? [])]
      .filter((e) => year === "all" || e.date.startsWith(year))
      .filter((e) => !needle || e.title.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [pastEvents, query, year]);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(event: PastEvent) {
    setEditing(event);
    setOpen(true);
  }

  const loaded = pastEvents !== undefined && pastEvents !== null;
  const total = loaded ? pastEvents.length : 0;
  const addedThisYear = loaded
    ? pastEvents.filter((e) => e.date.startsWith(thisYear)).length
    : 0;
  const latest =
    loaded && total > 0
      ? [...pastEvents].sort((a, b) => b.date.localeCompare(a.date))[0]
      : undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-body text-xs uppercase tracking-wide text-outline">
            Media &amp; recordings
          </p>
          <Heading as="h1" size="xl">
            Past events archive
          </Heading>
          <p className="max-w-xl font-body text-base text-on-surface-variant">
            Keep recordings of past church gatherings in one place. Paste a
            YouTube link and the thumbnail is generated automatically.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add past event
        </Button>
      </header>

      <MockDataNotice />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {!loaded ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))
        ) : (
          <>
            <StatCard label="Recorded events" value={String(total)} />
            <StatCard
              label={`Events in ${thisYear}`}
              value={String(addedThisYear)}
            />
            <StatCard
              label="Latest event"
              value={latest ? formatDate(fromDateInput(latest.date)) : "—"}
              hint={latest?.title}
            />
          </>
        )}
      </div>

      <section
        aria-labelledby="archive"
        className="space-y-4 rounded-md bg-white p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="archive"
            className="font-body text-base font-semibold text-on-surface"
          >
            Archived events{" "}
            {loaded && (
              <span className="font-normal text-on-surface-variant">
                ({filtered.length} showing)
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
              />
              <Input
                aria-label="Search past events"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by event name…"
                className="w-56 pl-8"
              />
            </div>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger aria-label="Filter by year" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!loaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={total === 0 ? "No past events yet" : "Nothing matches"}
            message={
              total === 0
                ? "Add a YouTube recording to start the archive members can browse."
                : "Try a different search or year."
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((event) => {
              const videoId =
                event.youtubeVideoId || parseYouTubeVideoId(event.youtubeUrl);
              return (
                <li
                  key={event._id}
                  className="overflow-hidden rounded-md bg-surface-low"
                >
                  {videoId ? (
                    <a
                      href={youtubeWatchUrl(videoId)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Watch ${event.title} on YouTube`}
                      className="group relative block"
                    >
                      {/* External YouTube thumbnail — plain <img>, no next/image remote config. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={youtubeThumbnailUrl(videoId)}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-primary opacity-90 transition-transform group-hover:scale-110">
                          <Play className="h-5 w-5" aria-hidden="true" />
                        </span>
                      </span>
                    </a>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center text-outline">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm font-medium text-on-surface">
                        {event.title}
                      </p>
                      <p className="font-body text-xs text-on-surface-variant">
                        {formatDate(fromDateInput(event.date))}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(event)}
                      aria-label={`Edit ${event.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PastEventDialog open={open} onOpenChange={setOpen} pastEvent={editing} />
    </div>
  );
}
