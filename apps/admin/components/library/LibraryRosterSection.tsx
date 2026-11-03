"use client";

import Link from "next/link";
import { CalendarDays, Inbox, UserPlus } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/shadcn/badge";
import { Reveal } from "@/components/motion/Reveal";
import { churchDateTimeLabel } from "@/lib/churchTime";
import { feedSentence } from "@/components/department/feedCopy";
import { Panel, PanelLines, useMinuteClock } from "./libraryDashboardParts";

/**
 * The two things an HOD genuinely used the shared dashboard for, kept
 * (spec 0017, AC-4).
 *
 * A pending roster claim, what is scheduled next, and the recent activity
 * feed. They sit BELOW the tabs rather than above them, because the Library
 * dashboard is about the Library and this is the department's other life.
 *
 * This component is only mounted for a caller holding `viewRoster`. That is
 * the whole mechanism: for a roster member neither `getDashboard` nor
 * `listDepartmentFeed` is called at all, rather than called and rendered as an
 * error. Both would refuse them anyway, so asking would buy a guaranteed null
 * the interface would have to apologise for.
 *
 * The verified member count, the mentorship figure and the church's weekly
 * programs are deliberately NOT here: they are what the Library team never
 * came for, and AC-5 says they appear nowhere on this dashboard.
 */
export function LibraryRosterSection({
  departmentId,
  basePath,
}: {
  departmentId: Id<"departments">;
  basePath: string;
}) {
  const now = useMinuteClock();
  const dashboard = useAuthQuery(api.departmentShell.getDashboard, {
    departmentId,
    now,
  });
  const feed = useAuthQuery(api.departmentShell.listDepartmentFeed, {
    departmentId,
  });

  return (
    <div className="space-y-6">
      <h2 className="font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        Your department
      </h2>

      {dashboard && dashboard.claimsWaitingCount > 0 && (
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
        <Panel
          title="Next activities"
          icon={<CalendarDays className="size-4" />}
          action={
            <Link
              href={`${basePath}/activities`}
              className="font-body text-xs font-semibold normal-case tracking-normal text-primary hover:underline"
            >
              Open
            </Link>
          }
        >
          {dashboard === undefined ? (
            <PanelLines />
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
        </Panel>

        <Panel title="Recent activity" icon={<Inbox className="size-4" />}>
          {feed === undefined ? (
            <PanelLines />
          ) : feed === null ? (
            <ErrorState />
          ) : feed.length === 0 ? (
            <EmptyState
              title="Nothing has happened here yet"
              message="Confirmations, members, messages and activities appear here as they happen."
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
        </Panel>
      </div>
    </div>
  );
}
