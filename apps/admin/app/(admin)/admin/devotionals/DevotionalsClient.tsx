"use client";

import { useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Search } from "lucide-react";
import {
  addDaysToDateKey,
  dateKeyFromMs,
  dateKeyRange,
} from "@klt-cyber/shared";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
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
  useDevotionalList,
  type Devotional,
} from "../_lib/mediaContentData";
import { DevotionalDialog } from "./DevotionalDialog";

const UPCOMING_DAYS = 14;

type StatusFilter = "all" | "today" | "scheduled" | "past";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "today", label: "Today" },
  { value: "scheduled", label: "Scheduled" },
  { value: "past", label: "Past" },
];

function keyToMs(key: string): number {
  return fromDateInput(key);
}

function weekday(key: string): string {
  return new Date(keyToMs(key)).toLocaleDateString("en-GB", {
    weekday: "short",
  });
}

function dayMonth(key: string): string {
  return new Date(keyToMs(key)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function statusOf(
  date: string,
  todayKey: string,
): Exclude<StatusFilter, "all"> {
  if (date === todayKey) return "today";
  return date > todayKey ? "scheduled" : "past";
}

export function DevotionalsClient() {
  const devotionals = useDevotionalList();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Devotional | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const todayKey = dateKeyFromMs(Date.now());
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const upcomingKeys = useMemo(
    () => dateKeyRange(todayKey, UPCOMING_DAYS),
    [todayKey],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Devotional>();
    for (const d of devotionals ?? []) map.set(d.date, d);
    return map;
  }, [devotionals]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(devotionals ?? [])]
      .filter((d) => status === "all" || statusOf(d.date, todayKey) === status)
      .filter(
        (d) =>
          !needle ||
          d.title.toLowerCase().includes(needle) ||
          d.scriptureReference.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [devotionals, query, status, todayKey]);

  function openNew(date?: string) {
    setEditing(null);
    setDefaultDate(date);
    setOpen(true);
  }

  function openEdit(devotional: Devotional) {
    setEditing(devotional);
    setDefaultDate(undefined);
    setOpen(true);
  }

  const loaded = devotionals !== undefined && devotionals !== null;
  const tomorrowMissing = loaded && !byDate.has(tomorrowKey);
  const readyCount = upcomingKeys.filter((key) => byDate.has(key)).length;
  const emptyCount = UPCOMING_DAYS - readyCount;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading as="h1" size="xl">
            Devotionals management
          </Heading>
          <p className="max-w-xl font-body text-base text-on-surface-variant">
            Schedule daily spiritual nourishment and keep every day covered. One
            devotional per date.
          </p>
        </div>
        <Button size="sm" onClick={() => openNew()}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add devotional
        </Button>
      </header>

      <MockDataNotice />

      {tomorrowMissing && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-low px-4 py-3"
        >
          <div className="space-y-0.5">
            <Badge variant="pending">Attention needed</Badge>
            <p className="font-body text-sm text-error">
              Tomorrow ({dayMonth(tomorrowKey)}) has no devotional assigned.
              Members open the app expecting a morning reading.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openNew(tomorrowKey)}
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            Write it now
          </Button>
        </div>
      )}

      <section
        aria-labelledby="next-days"
        className="space-y-4 rounded-md bg-white p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="next-days"
              className="font-body text-base font-semibold text-on-surface"
            >
              Next {UPCOMING_DAYS} days planner
            </h2>
            <p className="font-body text-xs text-on-surface-variant">
              Publishing coverage for the coming two weeks.
            </p>
          </div>
          {loaded && (
            <p className="font-body text-xs text-on-surface-variant">
              <span className="text-primary">Ready ({readyCount})</span>
              {" · "}
              <span className="text-error">Unassigned ({emptyCount})</span>
            </p>
          )}
        </div>

        {!loaded ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {upcomingKeys.map((key) => {
              const existing = byDate.get(key);
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => (existing ? openEdit(existing) : openNew(key))}
                  className={
                    isToday
                      ? "min-h-24 rounded-md bg-secondary px-3 py-2 text-left transition-colors hover:bg-muted"
                      : "min-h-24 rounded-md bg-surface-low px-3 py-2 text-left transition-colors hover:bg-muted"
                  }
                >
                  <span className="block font-body text-[11px] uppercase tracking-wide text-outline">
                    {isToday ? "Today" : weekday(key)}
                  </span>
                  <span className="block font-body text-sm font-medium text-on-surface">
                    {dayMonth(key)}
                  </span>
                  {existing ? (
                    <>
                      <span className="mt-1 line-clamp-2 block font-body text-xs text-on-surface-variant">
                        {existing.title}
                      </span>
                      <span className="mt-1 block font-body text-[11px] text-primary">
                        Ready
                      </span>
                    </>
                  ) : (
                    <span className="mt-2 block font-body text-[11px] text-error">
                      Empty · Assign
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-labelledby="all-devotionals"
        className="space-y-4 rounded-md bg-white p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="all-devotionals"
              className="font-body text-base font-semibold text-on-surface"
            >
              All devotionals
            </h2>
            <p className="font-body text-xs text-on-surface-variant">
              Archive, scheduled releases and what is live today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
              />
              <Input
                aria-label="Search devotionals"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title or scripture…"
                className="w-56 pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as StatusFilter)}
            >
              <SelectTrigger aria-label="Filter by status" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              devotionals.length === 0
                ? "No devotionals yet"
                : "Nothing matches"
            }
            message={
              devotionals.length === 0
                ? "Add the first devotional to put today's reading in front of members."
                : "Try a different search or status."
            }
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((d) => {
              const state = statusOf(d.date, todayKey);
              const expanded = previewId === d._id;
              return (
                <li key={d._id} className="rounded-md bg-surface-low px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-primary">
                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-body text-sm font-medium text-on-surface">
                          <span className="truncate">{d.title}</span>
                          {state === "today" ? (
                            <Badge variant="verified">Today</Badge>
                          ) : state === "scheduled" ? (
                            <Badge variant="member">Scheduled</Badge>
                          ) : (
                            <Badge variant="neutral">Past</Badge>
                          )}
                        </p>
                        <p className="truncate font-body text-xs text-on-surface-variant">
                          {d.scriptureReference} · Publish date{" "}
                          {formatDate(keyToMs(d.date))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewId(expanded ? null : d._id)}
                        aria-expanded={expanded}
                      >
                        {expanded ? "Hide" : "Preview"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(d)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                  {expanded && (
                    <p className="mt-3 whitespace-pre-line rounded-md bg-white px-4 py-3 font-body text-sm text-on-surface">
                      {d.body}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DevotionalDialog
        open={open}
        onOpenChange={setOpen}
        devotional={editing}
        defaultDate={defaultDate}
        existing={devotionals ?? []}
      />
    </div>
  );
}
