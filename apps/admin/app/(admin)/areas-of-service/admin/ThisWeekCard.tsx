"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { Calendar, ClipboardList, Repeat } from "lucide-react";
import {
  formatKampalaDayHeading,
  formatKampalaTime,
  kampalaDateKeyAt,
} from "@klt-cyber/shared";
import { api } from "@/lib/api";
import { Badge } from "@/components/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Reveal } from "@/components/motion/Reveal";
import { AudienceBadge } from "./events/AudienceField";

// The dashboard's This week card (spec 0021, AC-2). Every time is church time
// (Africa/Kampala), whatever zone the viewer's browser is in, because the
// week itself is the church's Monday to Sunday.

type ThisWeek = FunctionReturnType<typeof api.admin.getThisWeek>;

function churchDay(instant: number, now: number) {
  return formatKampalaDayHeading(kampalaDateKeyAt(instant), now);
}

function Section({
  icon: Icon,
  title,
  href,
  empty,
  children,
}: {
  icon: React.ElementType;
  title: string;
  href: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          <Icon className="size-3.5" aria-hidden="true" />
          {title}
        </h3>
        <Link
          href={href}
          className="font-body text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Open
        </Link>
      </div>
      {empty ? (
        <p className="px-1 py-1 font-body text-sm text-outline">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function Row({
  title,
  when,
  cancelled,
  extra,
}: {
  title: string;
  when: string;
  cancelled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-low">
      <span className="w-28 shrink-0 font-mono text-xs text-on-surface-variant">{when}</span>
      <span
        className={
          cancelled
            ? "min-w-0 flex-1 truncate font-body text-sm text-error line-through"
            : "min-w-0 flex-1 truncate font-body text-sm font-medium text-on-surface"
        }
      >
        {title}
      </span>
      {cancelled && (
        <Badge variant="rejected" className="shrink-0">
          Cancelled
        </Badge>
      )}
      {extra}
    </li>
  );
}

export function ThisWeekCard({ data }: { data: ThisWeek | undefined }) {
  const now = Date.now();
  return (
    <Card className="gap-4 border-t-4 border-t-primary p-5">
      <CardHeader className="p-0">
        <CardTitle className="font-body text-base font-semibold text-on-surface">
          This week
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-0">
        {data === undefined ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : data === null ? (
          <p className="font-body text-xs text-on-surface-variant">
            The church week is shown to Administration only.
          </p>
        ) : (
          <Reveal className="space-y-4">
            <Section
              icon={Repeat}
              title="Programs"
              href="/areas-of-service/admin/weekly-program"
              empty={data.programs.length === 0 ? "No programs this week." : null}
            >
              <ul className="flex flex-col">
                {data.programs.map((program) => (
                  <Row
                    key={program.occurrenceKey}
                    title={program.title}
                    when={`${churchDay(program.start, now)}, ${formatKampalaTime(program.start)}`}
                    cancelled={program.cancelled}
                  />
                ))}
              </ul>
            </Section>

            <Section
              icon={Calendar}
              title="Next events"
              href="/areas-of-service/admin/events"
              empty={data.events.length === 0 ? "No upcoming events." : null}
            >
              <ul className="flex flex-col">
                {data.events.map((event) => (
                  <Row
                    key={event._id}
                    title={event.title}
                    when={`${churchDay(event.startDateTime, now)}, ${formatKampalaTime(event.startDateTime)}`}
                    cancelled={event.cancelled}
                    extra={
                      <span className="hidden shrink-0 sm:inline-flex">
                        <AudienceBadge audience={event.audience} />
                      </span>
                    }
                  />
                ))}
              </ul>
            </Section>

            <Section
              icon={ClipboardList}
              title="Planned, next 14 days"
              href="/areas-of-service/admin/year-planner"
              empty={
                data.plannedActivities.length === 0
                  ? "Nothing planned in the next two weeks."
                  : null
              }
            >
              <ul className="flex flex-col">
                {data.plannedActivities.map((activity) => (
                  <Row
                    key={activity._id}
                    title={activity.title}
                    when={churchDay(activity.targetDate, now)}
                  />
                ))}
              </ul>
            </Section>
          </Reveal>
        )}
      </CardContent>
    </Card>
  );
}
