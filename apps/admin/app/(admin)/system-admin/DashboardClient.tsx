"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { displayName, formatLongDate, formatRelativeTime } from "@/lib/format";
import {
  activitySubjectId,
  describeActivity,
  type ActivityEntry,
} from "@/lib/activity";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Avatar } from "@/components/shadcn/avatar";
import { Heading } from "@/components/ui/Heading";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";

// System-admin dashboard landing: editorial greeting, the four headline
// counts, the live activity feed, and an "Attention Needed" column that only
// speaks when something actually needs a decision. All data is live Convex —
// undefined means loading, rendered as layout-stable skeletons (§12.1).

export function DashboardClient() {
  const account = useAuthQuery(api.profile.getMyAccount);
  const stats = useAuthQuery(api.admin.getDashboardStats);
  const activity = useAuthQuery(api.admin.listRecentActivity, { limit: 15 });

  const adminName = account
    ? (account.user.firstName ?? account.user.email)
    : null;

  const memberPct = stats
    ? Math.round((stats.totalMembers / stats.totalUsers) * 100) || 0
    : 0;
  const rolesPct = stats
    ? Math.round((stats.totalMembersWithRoles / stats.totalMembers) * 100) || 0
    : 0;
  const membersWithoutRoles = stats
    ? stats.totalMembers - stats.totalMembersWithRoles
    : 0;

  return (
    <div className="space-y-10">
      {/* ── Greeting region — editorial, breathable ─────────────────────── */}
      <div>
        <Heading as="h1" size="2xl">
          {"Welcome back"}
          {adminName ? `, ${adminName}` : ""}
        </Heading>
        <p className="mt-2 font-body text-base text-on-surface-variant">
          {formatLongDate()}
        </p>
      </div>

      {/* ── Headline counts ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {stats == null ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total users"
              value={stats.totalUsers}
              trend={{
                label: `+${stats.signupsLast7Days} this week`,
                tone: stats.signupsLast7Days > 0 ? "positive" : "neutral",
              }}
            />
            <StatCard
              label="Members"
              value={stats.totalMembers}
              hint={`${memberPct}% of all users`}
            />
            <StatCard
              label="Members with roles"
              value={stats.totalMembersWithRoles}
              hint={`${rolesPct}% of members`}
            />
            <StatCard
              label="Sign-ups (7 days)"
              value={stats.signupsLast7Days}
              hint={`${stats.signupsLast30Days} in the last 30 days`}
            />
          </>
        )}
      </div>

      {/* ── Feed + attention column ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="gap-4 p-6">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-lg font-semibold text-on-surface">
              Recent Activity
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {activity == null ? (
              <FeedSkeleton />
            ) : activity.entries.length === 0 ? (
              <EmptyState
                title="No activity yet"
                message="Administrative events will appear here."
              />
            ) : (
              <ul>
                {activity.entries.map((entry) => (
                  <li key={entry._id}>
                    <ActivityRow entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>

          <CardFooter className="p-0 px-2">
            <Link
              href="/system-admin/activity"
              className="font-body text-sm font-medium text-primary underline underline-offset-2"
            >
              View all →
            </Link>
          </CardFooter>
        </Card>

        <div className="space-y-4 self-start">
          <h2 className="font-body text-lg font-semibold text-on-surface">
            Attention Needed
          </h2>

          {stats == null ? (
            <>
              <div className="h-24 animate-pulse rounded-lg bg-surface-low" />
              <div className="h-24 animate-pulse rounded-lg bg-surface-low" />
            </>
          ) : stats.pendingVerifications === 0 &&
            stats.suspendedUsers === 0 &&
            membersWithoutRoles === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={<AllClearIcon />}
                title="All clear."
                message="Nothing needs your attention right now."
              />
            </Card>
          ) : (
            <>
              {stats.pendingVerifications > 0 && (
                <AttentionCard
                  href="/system-admin/users"
                  count={stats.pendingVerifications}
                  label="Pending verifications"
                  caption="Member profiles awaiting review"
                  cardClass="bg-warning-light"
                  countClass="text-warning"
                />
              )}
              {stats.suspendedUsers > 0 && (
                <AttentionCard
                  href="/system-admin/users?status=suspended"
                  count={stats.suspendedUsers}
                  label="Suspended users"
                  caption="Access currently revoked"
                  cardClass="bg-crimson-light"
                  countClass="text-crimson"
                />
              )}
              {membersWithoutRoles > 0 && (
                <AttentionCard
                  href="/system-admin/users?role=member&roles=without"
                  count={membersWithoutRoles}
                  label="Members without roles"
                  caption="No administrative role assigned"
                  cardClass="bg-surface-low"
                  countClass="text-on-surface"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Feed row ──────────────────────────────────────────────────────────────

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const subjectId = activitySubjectId(entry);

  const content = (
    <>
      <Avatar
        name={displayName(entry.actor)}
        email={entry.actor?.email}
        src={entry.actor?.profilePictureUrl}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate font-body text-sm text-on-surface">
        {describeActivity(entry)}
      </span>
      <span className="whitespace-nowrap font-body text-xs text-outline">
        {formatRelativeTime(entry._creationTime)}
      </span>
    </>
  );

  const rowClass =
    "flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-low";

  if (!subjectId) {
    return <div className={rowClass}>{content}</div>;
  }
  return (
    <Link href={`/system-admin/users/${subjectId}`} className={rowClass}>
      {content}
    </Link>
  );
}

// ── Attention card ────────────────────────────────────────────────────────

function AttentionCard({
  href,
  count,
  label,
  caption,
  cardClass,
  countClass,
}: {
  href: string;
  count: number;
  label: string;
  caption: string;
  cardClass: string;
  countClass: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-md p-4 transition hover:brightness-[0.98]",
        cardClass,
      )}
    >
      <span className={cn("font-mono text-2xl font-bold", countClass)}>
        {count}
      </span>
      <span className="mt-1 block font-body text-sm font-semibold text-on-surface">
        {label}
      </span>
      <span className="mt-0.5 block font-body text-xs text-on-surface-variant">
        {caption}
      </span>
    </Link>
  );
}

// ── Skeletons (layout-stable, §12.1) ──────────────────────────────────────

function StatSkeleton() {
  return <div className="h-32 animate-pulse rounded-md bg-surface-low" />;
}

function FeedSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-surface-low" />
          <div className="h-4 flex-1 animate-pulse rounded-sm bg-surface-low" />
          <div className="h-3 w-12 shrink-0 animate-pulse rounded-sm bg-surface-low" />
        </div>
      ))}
    </div>
  );
}

// Warm sunrise mark for the all-clear state (§12.3): 40px, outline tone.
function AllClearIcon(): ReactNode {
  return (
    <svg
      className="h-10 w-10 text-outline"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 26a9 9 0 0 1 18 0" />
      <path d="M4 26h32" />
      <path d="M20 8v3.5" />
      <path d="M8.5 13.5 11 16" />
      <path d="M31.5 13.5 29 16" />
      <path d="M9 32h22" />
    </svg>
  );
}
