"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCheck,
  GraduationCap,
  Inbox,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatGridSkeleton } from "@/components/ui/Skeletons";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Badge } from "@/components/shadcn/badge";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { churchDateTimeLabel } from "@/lib/churchTime";
import { feedSentence } from "./feedCopy";

/**
 * A department's dashboard (spec 0012, AC-33 to AC-38).
 *
 * Shared by every department: the dynamic `[slug]` portal mounts it, and a
 * bespoke portal can too. It takes its department as a prop rather than reading
 * the route, which is what makes that possible.
 */

/**
 * The clock, advanced once a minute.
 *
 * Every "is this upcoming" judgement in the shell is made against a `now` the
 * client supplies, never a server side `Date.now()`: a live query cannot
 * re-evaluate the server's clock, so "upcoming" would freeze at whatever the
 * time was when the page was opened. Rounded down to the minute so the query
 * re-runs sixty times an hour at most, rather than on every tick.
 */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / 60_000) * 60_000),
      30_000,
    );
    return () => clearInterval(id);
  }, []);
  return now;
}

export function DepartmentDashboard({
  departmentId,
  departmentName,
  basePath,
  canViewRoster,
}: {
  departmentId: Id<"departments">;
  departmentName: string;
  /** The portal this dashboard sits in, e.g. `/areas-of-service/finance`. */
  basePath: string;
  canViewRoster: boolean;
}) {
  const now = useMinuteClock();
  const dashboard = useAuthQuery(api.departmentShell.getDashboard, {
    departmentId,
    now,
  });
  const feed = useAuthQuery(api.departmentShell.listDepartmentFeed, {
    departmentId,
  });
  const programs = useAuthQuery(api.weeklyPrograms.listActivePrograms);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Heading as="h1" size="xl">
          {departmentName}
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          How your area of service is doing right now.
        </p>
      </header>

      {dashboard === undefined ? (
        <StatGridSkeleton count={4} />
      ) : dashboard === null ? (
        <ErrorState />
      ) : (
        <Reveal
          as="section"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard
            label="Verified members"
            value={<CountUp value={dashboard.verifiedCount} />}
            hint={
              dashboard.rosterCount === dashboard.verifiedCount
                ? "Everyone on the roster is verified"
                : `${dashboard.rosterCount} on the roster, ${dashboard.rosterCount - dashboard.verifiedCount} not yet verified`
            }
          />
          <StatCard
            label="Requests waiting"
            value={<CountUp value={dashboard.claimsWaitingCount} />}
            hint={
              dashboard.claimsWaitingCount === 0
                ? "Nobody is waiting on you"
                : "People asking to serve here"
            }
            emphasized={dashboard.claimsWaitingCount > 0}
          />
          <StatCard
            label="Mentorship still to finish"
            value={<CountUp value={dashboard.mentorshipGapCount} />}
            hint="Members not yet marked completed"
          />
          <StatCard
            label="Coming up"
            // The real number ahead, not the handful the card below lists.
            value={
              dashboard.upcomingCountCapped ? (
                <span>
                  <CountUp value={dashboard.upcomingCount} />+
                </span>
              ) : (
                <CountUp value={dashboard.upcomingCount} />
              )
            }
            hint="Activities still ahead"
          />
        </Reveal>
      )}

      {dashboard && dashboard.claimsWaitingCount > 0 && canViewRoster && (
        <Reveal as="section">
          <Link
            href={`${basePath}/roster`}
            className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary-light p-4 shadow-e1 transition-colors hover:bg-primary-dim"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UserPlus className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-body text-sm font-semibold text-on-surface">
                {dashboard.claimsWaitingCount === 1
                  ? "One person is asking to serve here"
                  : `${dashboard.claimsWaitingCount} people are asking to serve here`}
              </span>
              <span className="block font-body text-xs text-on-surface-variant">
                Open the roster to confirm or decline.
              </span>
            </span>
            <span className="shrink-0 font-body text-sm font-semibold text-primary">
              Review →
            </span>
          </Link>
        </Reveal>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Next activities" icon={<CalendarDays className="size-4" />}>
          {dashboard === undefined ? (
            <CardLines />
          ) : dashboard === null ? (
            <ErrorState />
          ) : dashboard.upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled yet"
              message="Activities you schedule will show up here."
            />
          ) : (
            <ul className="space-y-3">
              {dashboard.upcoming.map((activity) => (
                <li key={activity._id} className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-on-surface">
                    {activity.title}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    <span className="font-mono">
                      {churchDateTimeLabel(activity.startDateTime)}
                    </span>
                    {activity.location ? ` · ${activity.location}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="This week at church" icon={<CheckCheck className="size-4" />}>
          {programs === undefined ? (
            <CardLines />
          ) : programs === null ? (
            <ErrorState />
          ) : programs.length === 0 ? (
            <EmptyState
              title="No weekly programs"
              message="The church office has not published any yet."
            />
          ) : (
            <ul className="space-y-3">
              {programs.slice(0, 5).map((program) => (
                <li key={program._id} className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-on-surface">
                    {program.title}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    <span className="font-mono">
                      {program.startTime ?? program.time ?? "—"}
                    </span>
                    {program.location ? ` · ${program.location}` : ""}
                    {program.nextOccurrence?.cancelled ? " · off this week" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Recent activity" icon={<Inbox className="size-4" />}>
        {feed === undefined ? (
          <CardLines />
        ) : feed === null ? (
          <ErrorState />
        ) : feed.length === 0 ? (
          <EmptyState
            title="Nothing has happened here yet"
            message="Confirmations, members, messages and activities will appear here as they happen."
          />
        ) : (
          <ul className="space-y-3">
            {feed.map((entry) => (
              <li key={entry._id} className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  <Badge variant="neutral">
                    <span className="font-mono text-[11px]">
                      {churchDateTimeLabel(entry.at).split(",")[0]}
                    </span>
                  </Badge>
                </span>
                <p className="min-w-0 flex-1 font-body text-sm text-on-surface">
                  {feedSentence(entry)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!canViewRoster && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <Users className="size-3.5" aria-hidden="true" />
          Some pages are limited to this department&apos;s head.
        </p>
      )}

      {dashboard?.mentorshipGapCount === 0 && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <GraduationCap className="size-3.5" aria-hidden="true" />
          Everyone on this roster has completed mentorship.
        </p>
      )}
    </div>
  );
}

/** A dashboard panel. Same parchment card the stat cards use. */
function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-lowest p-5 shadow-e1">
      <h2 className="mb-4 flex items-center gap-2 font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        <span className="text-primary" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CardLines() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
