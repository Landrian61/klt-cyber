"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ClipboardCheck,
  Users,
  Calendar,
  Megaphone,
  ArrowRight,
  Repeat,
} from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Heading } from "@/components/ui/Heading";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { buttonVariants } from "@/components/shadcn/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/shadcn/tabs";
import { MembershipGrowthChart } from "./MembershipGrowthChart";
import { DemographicsCharts } from "./DemographicsCharts";
import { MentorshipPipelineChart } from "./MentorshipPipelineChart";
import { DepartmentRosterChart } from "./DepartmentRosterChart";
import { ClanMaritalChart } from "./ClanMaritalChart";
import { ClanDistributionChart } from "./ClanDistributionChart";
import { CrossTabExplorer } from "./CrossTabExplorer";
import { MinistryMilestonesFunnel } from "./MinistryMilestonesFunnel";
import { MinistryEngagementHeatmap } from "./MinistryEngagementHeatmap";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { DashboardRosterTable } from "./DashboardRosterTable";
import { useDashboardFilters } from "./useDashboardFilters";
import {
  bucketDepartments,
  bucketLeadershipStage,
  bucketAgeByDepartment,
  leadershipCompletionRate,
  mentorshipCompletionRate,
  matchesDashboardFilters,
} from "./demographicsUtils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Tonal icon chips — semantic token pairs, never a raw Tailwind palette.
const CHIP_TONES = {
  gold: "bg-primary-light text-primary",
  royal: "bg-surface-low text-on-surface-variant",
  success: "bg-success-light text-success",
  crimson: "bg-crimson-light text-crimson",
} as const;

function StatTile({
  href,
  icon: Icon,
  tone,
  label,
  value,
}: {
  href: string;
  icon: React.ElementType;
  tone: keyof typeof CHIP_TONES;
  label: string;
  value: number | undefined;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-lowest p-5 shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e2"
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full",
          CHIP_TONES[tone],
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <div className="font-mono text-4xl font-bold leading-none text-on-surface">
          {value === undefined ? (
            <Skeleton className="h-9 w-12" />
          ) : (
            <CountUp value={value} />
          )}
        </div>
        <p className="mt-1 font-body text-sm text-on-surface-variant">
          {label}
        </p>
      </div>
    </Link>
  );
}

function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function AdminDashboardClient() {
  const pending = useAuthQuery(api.memberProfiles.listPendingVerifications);
  const roster = useAuthQuery(
    api.departmentMemberships.listDepartmentMembers,
    {},
  );
  const programs = useAuthQuery(api.weeklyPrograms.listActivePrograms);
  const announcements = useAuthQuery(api.announcements.listActiveAnnouncements);
  const upcomingEvents = useAuthQuery(api.events.listUpcomingEvents, {
    limit: 5,
  });

  // Act 1 (unfiltered) sources.
  const recentActivity = useAuthQuery(api.admin.listRecentActivity, {
    limit: 5,
  });

  // Act 2 (Zone 1-4, filtered) sources — one query for charts/KPIs (narrow,
  // no names), one for the roster table (adds names). Both run through the
  // same `matchesDashboardFilters` predicate below so every zone agrees.
  const analytics = useAuthQuery(api.memberProfiles.listProfilesForAnalytics, {});
  const profileRoster = useAuthQuery(api.memberProfiles.listProfileRoster, {});
  const clans = useAuthQuery(api.clans.listClans);
  const departments = useAuthQuery(api.departments.listDepartments);

  const clanNameById = useMemo(() => {
    const map = new Map<Id<"clans">, string>();
    clans?.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [clans]);
  const departmentNameById = useMemo(() => {
    const map = new Map<Id<"departments">, string>();
    departments?.forEach((d) => map.set(d._id, d.name));
    return map;
  }, [departments]);

  // Growth chart stays unfiltered (Act 1) — verified-only, by definition.
  const verifiedProfiles = useMemo(
    () => analytics?.filter((p) => p.profileStatus === "verified"),
    [analytics],
  );

  const { filters, setFilter, clearFilters, activeCount } = useDashboardFilters();

  const filteredAnalytics = useMemo(
    () => analytics?.filter((p) => matchesDashboardFilters(p, filters)),
    [analytics, filters],
  );
  const filteredRoster = useMemo(
    () => profileRoster?.filter((p) => matchesDashboardFilters(p, filters)),
    [profileRoster, filters],
  );

  const leadershipStageData = useMemo(
    () => (filteredAnalytics ? bucketLeadershipStage(filteredAnalytics) : undefined),
    [filteredAnalytics],
  );
  const leadershipRate = useMemo(
    () =>
      filteredAnalytics ? leadershipCompletionRate(filteredAnalytics) : undefined,
    [filteredAnalytics],
  );
  const mentorshipRate = useMemo(
    () =>
      filteredAnalytics ? mentorshipCompletionRate(filteredAnalytics) : undefined,
    [filteredAnalytics],
  );
  const ageByDepartmentData = useMemo(
    () =>
      filteredAnalytics && departments
        ? bucketAgeByDepartment(filteredAnalytics, departments)
        : undefined,
    [filteredAnalytics, departments],
  );
  const departmentSizeData = useMemo(
    () =>
      filteredAnalytics
        ? bucketDepartments(filteredAnalytics, departmentNameById).map((d) => ({
            name: d.label,
            count: d.count,
          }))
        : undefined,
    [filteredAnalytics, departmentNameById],
  );

  const recentPending = pending?.slice(0, 5);

  const upcoming = [
    ...(programs?.map((p) => ({
      key: `program-${p._id}`,
      title: p.title,
      recurring: true as const,
      weekday: DAY_LABELS[p.daysOfWeek?.[0] ?? p.dayOfWeek ?? 0],
    })) ?? []),
    ...(upcomingEvents?.map((e) => ({
      key: `event-${e._id}`,
      title: e.title,
      recurring: false as const,
      month: new Date(e.startDateTime).toLocaleDateString(undefined, {
        month: "short",
      }),
      day: new Date(e.startDateTime).getDate(),
    })) ?? []),
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Dashboard
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Pending work across Administration, and a filterable view of the
          membership itself.
        </p>
      </header>

      <Tabs defaultValue="pulse">
        <TabsList variant="line">
          <TabsTrigger value="pulse">Operational Pulse</TabsTrigger>
          <TabsTrigger value="explorer">Segment Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="pulse" className="space-y-6">
          <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              href="/admin/verification"
              icon={ClipboardCheck}
              tone="gold"
              label="Pending verifications"
              value={pending?.length}
            />
            <StatTile
              href="/admin/roster"
              icon={Users}
              tone="royal"
              label="Roster size"
              value={roster?.members.length}
            />
            <StatTile
              href="/admin/weekly-program"
              icon={Calendar}
              tone="success"
              label="Programs this week"
              value={programs?.length}
            />
            <StatTile
              href="/admin/announcements"
              icon={Megaphone}
              tone="crimson"
              label="Active announcements"
              value={announcements?.length}
            />
          </Reveal>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="gap-3 p-5">
              <CardHeader className="p-0">
                <CardTitle className="font-body text-base font-semibold text-on-surface">
                  Recent activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recentActivity === undefined ? (
                  <div className="flex flex-col gap-2" aria-hidden="true">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 rounded-lg" />
                    ))}
                  </div>
                ) : recentActivity === null ? (
                  <p className="font-body text-xs text-on-surface-variant">
                    Not available for your role yet — requires System Admin
                    access.
                  </p>
                ) : (
                  <EmptyState
                    title="Nothing recent"
                    message="Activity will appear here."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="gap-3 border-t-4 border-t-primary p-5">
              <CardHeader className="p-0">
                <CardTitle className="font-body text-base font-semibold text-on-surface">
                  Upcoming
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {programs === undefined || upcomingEvents === undefined ? (
                  <div className="flex flex-col gap-2" aria-hidden="true">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 rounded-lg" />
                    ))}
                  </div>
                ) : upcoming.length === 0 ? (
                  <EmptyState
                    title="Nothing scheduled"
                    message="Programs and events will appear here."
                  />
                ) : (
                  <Reveal as="ul" className="flex flex-col gap-1" replayKey={upcoming.length}>
                    {upcoming.slice(0, 6).map((item) => (
                      <li
                        key={item.key}
                        className="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-low"
                      >
                        <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-md border border-border bg-surface-low">
                          {item.recurring ? (
                            <>
                              <Repeat
                                className="size-3.5 text-royal"
                                aria-hidden="true"
                              />
                              <span className="mt-0.5 font-body text-[10px] font-semibold uppercase leading-none text-on-surface-variant">
                                {item.weekday}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-body text-[9px] font-semibold uppercase leading-none text-crimson">
                                {item.month}
                              </span>
                              <span className="mt-0.5 font-mono text-sm font-bold leading-none text-on-surface">
                                {item.day}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="min-w-0 flex-1 truncate font-body text-sm font-medium text-on-surface">
                          {item.title}
                        </p>
                        <Badge variant="neutral" className="shrink-0">
                          {item.recurring ? "Weekly" : "Event"}
                        </Badge>
                      </li>
                    ))}
                  </Reveal>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Heading as="h2" size="lg">
              Growth &amp; Approvals
            </Heading>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[7fr_3fr]">
              <MembershipGrowthChart profiles={verifiedProfiles} />

              <Card className="gap-4 p-6">
                <CardHeader className="flex-row items-center justify-between gap-3 p-0">
                  <CardTitle className="font-body text-lg font-semibold text-on-surface">
                    Pending Approvals
                  </CardTitle>
                  {pending && pending.length > 5 && (
                    <Link
                      href="/admin/verification"
                      className="font-body text-sm font-medium text-primary underline underline-offset-2"
                    >
                      View all {pending.length}
                    </Link>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {recentPending === undefined ? (
                    <div className="flex flex-col gap-2" aria-hidden="true">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-lg" />
                      ))}
                    </div>
                  ) : recentPending.length === 0 ? (
                    <EmptyState
                      title="Nothing waiting for approval"
                      message="Submitted member profiles will appear here for review."
                    />
                  ) : (
                    <Reveal
                      as="ul"
                      className="flex flex-col"
                      replayKey={recentPending.length}
                    >
                      {recentPending.map((profile) => {
                        const name = fullName(profile);
                        return (
                          <li
                            key={profile._id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-low"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={name} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-body text-sm font-medium text-on-surface">
                                  {name}
                                </p>
                                <p className="font-body text-xs text-on-surface-variant">
                                  {new Date(
                                    profile._creationTime,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Link
                              href={`/admin/verification/${profile._id}`}
                              className={cn(
                                buttonVariants({
                                  variant: "secondary",
                                  size: "sm",
                                }),
                                "shrink-0",
                              )}
                            >
                              Review
                            </Link>
                          </li>
                        );
                      })}
                    </Reveal>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="space-y-4">
          <DashboardFilterBar
            filters={filters}
            onFilterChange={setFilter}
            onClear={clearFilters}
            activeCount={activeCount}
            clans={clans}
            departments={departments}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              emphasized
              label="Target Segment Match"
              value={filteredAnalytics === undefined ? "—" : filteredAnalytics.length}
            />
            <StatCard
              label="Verified"
              value={
                filteredAnalytics === undefined
                  ? "—"
                  : filteredAnalytics.filter((p) => p.profileStatus === "verified")
                      .length
              }
            />
            <StatCard
              label="Pending"
              value={
                filteredAnalytics === undefined
                  ? "—"
                  : filteredAnalytics.filter(
                      (p) => p.profileStatus === "pending_verification",
                    ).length
              }
            />
            <StatCard
              label="Mentorship completion"
              value={
                mentorshipRate === undefined || mentorshipRate === null
                  ? "—"
                  : `${mentorshipRate}%`
              }
              hint="of the matched segment"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DemographicsCharts
              profiles={filteredAnalytics}
              className="lg:col-span-2"
            />
            <ClanMaritalChart
              profiles={filteredAnalytics}
              clanNameById={clanNameById}
              className="lg:col-span-2"
            />
            <MentorshipPipelineChart profiles={filteredAnalytics} />
            <MinistryMilestonesFunnel
              data={leadershipStageData}
              completionRate={leadershipRate}
            />
            <ClanDistributionChart
              profiles={filteredAnalytics}
              clanNameById={clanNameById}
            />
            <DepartmentRosterChart data={departmentSizeData} />
            <MinistryEngagementHeatmap
              data={ageByDepartmentData}
              className="lg:col-span-2"
            />
            <CrossTabExplorer
              profiles={filteredAnalytics}
              clanNameById={clanNameById}
              departmentNameById={departmentNameById}
            />
          </div>

          <DashboardRosterTable
            roster={filteredRoster}
            clanNameById={clanNameById}
            departmentNameById={departmentNameById}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
