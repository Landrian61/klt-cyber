"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  HardDrive,
  Mail,
  MailWarning,
  MessageSquare,
  Smartphone,
  TrendingUp,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Heading } from "@/components/ui/Heading";
import { Skeleton } from "@/components/shadcn/skeleton";
import { StatGridSkeleton, PageHeaderSkeleton } from "@/components/ui/Skeletons";
import { ErrorState } from "@/components/ui/ErrorState";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { useIsOffline } from "@/hooks/use-is-offline";
import { Reveal } from "@/components/motion/Reveal";
import { formatBytesBinary } from "@klt-cyber/shared";
import {
  Meter,
  Panel,
  Section,
  SplitBar,
  Tile,
  type TileTone,
} from "./AnalyticsParts";

/**
 * Platform analytics (spec 0011, SRS §4.3.3).
 *
 * Ordered by what a System Admin can act on, not by where the numbers come
 * from. It opens with whatever is waiting for somebody, then the four figures
 * that describe the platform's size and reach, then the charts that give those
 * figures a shape, then the detail. Twenty equally weighted numbers make every
 * number look equally urgent, which in practice means none of them is read.
 *
 * Every chart answers a question a tile cannot. Growth shows *when* people
 * arrived, not just how many. Recency shows the accounts nobody has seen in a
 * month, which is invisible in three nested counts. The allowance chart
 * projects the month forward, turning "412 emails" into "we run out on the
 * 24th". The department chart ranks by volume so the quiet departments sort to
 * the bottom where somebody will notice them.
 *
 * Two kinds of time window live here, labelled differently wherever they
 * appear. Activity windows roll back from now, so today sits inside the last 7
 * days which sits inside the last 30. Volume windows are the Africa/Kampala
 * calendar month, because the allowances they are measured against reset with
 * the calendar.
 *
 * Nothing here renders a number it does not have. A figure whose source is not
 * built yet is a sentence naming the feature that will supply it; a proportion
 * is only drawn where the page genuinely holds the whole; and a projection is
 * always drawn dashed and labelled as a projection.
 */

// Recharts measures the DOM, so the bodies load client-side only — the same
// pattern the Administration dashboard's charts already use. One import path
// means the four of them share a chunk.
const chartLoading = () => <Skeleton className="size-full rounded-md" />;

const GrowthChartBody = dynamic(
  () => import("./AnalyticsChartBodies").then((m) => m.GrowthChartBody),
  { ssr: false, loading: chartLoading },
);
const RecencyChartBody = dynamic(
  () => import("./AnalyticsChartBodies").then((m) => m.RecencyChartBody),
  { ssr: false, loading: chartLoading },
);
const AllowanceChartBody = dynamic(
  () => import("./AnalyticsChartBodies").then((m) => m.AllowanceChartBody),
  { ssr: false, loading: chartLoading },
);
const DepartmentChartBody = dynamic(
  () => import("./AnalyticsChartBodies").then((m) => m.DepartmentChartBody),
  { ssr: false, loading: chartLoading },
);

export function AnalyticsClient() {
  const analytics = useAuthQuery(api.analytics.getPlatformAnalytics);
  const isOffline = useIsOffline();

  // Derived once per result rather than per render: the browser is doing real
  // arithmetic here (a running total over 30 days, a projection over a month)
  // and a chart re-mounting on an unrelated state change would re-animate.
  const charts = useMemo(
    () => (analytics ? buildChartData(analytics) : null),
    [analytics],
  );

  // Offline with nothing loaded is the only case that earns the full error
  // state; once a subscription has held values, offline is a banner over the
  // last figures it saw, which is the same treatment the dashboard uses.
  if (analytics === undefined && isOffline) {
    return <ErrorState cause="offline" />;
  }

  if (analytics === undefined) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <StatGridSkeleton count={4} />
        <StatGridSkeleton count={3} />
      </div>
    );
  }

  // Null means the subscription outlived the session (sign-out drops the
  // token). The redirect is already in flight; render nothing rather than an
  // error the user will never read.
  if (analytics === null || charts === null) return null;

  const { people, activity, devices, engagement, notifications, health, gaps } =
    analytics;

  // Named rather than left as "this month", so a System Admin reading the
  // page in the first hours of a new month is never in doubt about which
  // month a figure covers. Kampala, to match the boundary the server used.
  const monthLabel = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Kampala",
  });

  // The headline question this page exists to answer: of everyone who has an
  // account, how many opened it this month? Only drawn when there is a
  // denominator, because a percentage of nothing is not zero, it is undefined.
  const reach =
    people.totalAccounts > 0
      ? Math.round((activity.activeLast30Days / people.totalAccounts) * 100)
      : null;

  return (
    <div className="space-y-10">
      {isOffline && <OfflineBanner />}

      <div>
        <Heading size="xl">Platform analytics</Heading>
        <p className="mt-1 font-body text-sm text-on-surface-variant">
          Counted live each time this page opens, so nothing here is stale.
        </p>
      </div>

      <AttentionStrip
        items={attentionItems({ people, notifications, health, charts })}
      />

      {/* The four figures that describe the platform. Everything below is
          detail behind one of them. */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={Users}
          label="Total accounts"
          value={people.totalAccounts}
          hint="Deleted accounts excluded"
          tone="gold"
        />
        <Tile
          icon={ActivityIcon}
          label="Active today"
          value={activity.activeToday}
          hint="Since midnight in Kampala"
        />
        <Tile
          icon={TrendingUp}
          label="Reach, last 30 days"
          value={reach === null ? "—" : `${reach}%`}
          hint={
            reach === null
              ? "No accounts yet"
              : `${activity.activeLast30Days.toLocaleString("en-US")} of ${people.totalAccounts.toLocaleString("en-US")} accounts opened the app or portal`
          }
        />
        <Tile
          icon={Smartphone}
          label="Phones, last 30 days"
          value={devices.total}
          hint="Phones, not people: two phones on one account count twice"
        />
      </Reveal>

      <Panel
        title="Growth, last 30 days"
        icon={TrendingUp}
        footnote="Gold bars are the people who signed up that day; the blue line is the running total of accounts. Quiet days are kept as zeroes so a burst lands on the day it actually happened."
      >
        <div className="h-72 w-full">
          <GrowthChartBody data={charts.growth} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="When each account was last seen"
          icon={ActivityIcon}
          footnote="These four groups divide every account exactly once, because the three activity windows nest. The bottom bar is the one worth watching: those accounts exist but nobody behind them has opened anything in a month."
        >
          <div className="h-56 w-full">
            <RecencyChartBody data={charts.recency} />
          </div>
        </Panel>

        <Panel
          title="Who holds an account"
          icon={Users}
          footnote="A visitor becomes a member by completing the profile wizard; verification is a separate step Administration does."
        >
          <SplitBar
            segments={[
              { label: "Visitors", value: people.visitors, tone: "muted" },
              {
                label: "Verified members",
                value: people.verifiedMembers,
                tone: "gold",
              },
            ]}
          />
          <dl className="mt-5 space-y-2.5">
            <MiniRow
              icon={UserCheck}
              label="Waiting on verification"
              value={people.pendingVerification}
            />
            <MiniRow
              icon={UserPlus}
              label="Signed up, last 7 days"
              value={people.signupsLast7Days}
            />
            <MiniRow
              icon={UserPlus}
              label="Signed up, last 30 days"
              value={people.signupsLast30Days}
            />
            <MiniRow
              icon={Trash2}
              label="Accounts deleted, to date"
              value={people.accountDeletions}
            />
          </dl>
        </Panel>
      </div>

      <Section
        title="Allowances"
        description={`What ${monthLabel} has used of the plans recorded on the Costs page. These are the two figures that decide whether a free tier is still enough.`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Emails this month"
            icon={Mail}
            className="lg:col-span-2"
            footnote="A running total. The dashed line continues today's average to the end of the month: it is a projection, not a measurement. Counts logged sends, which leave out mail to an address with no account."
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-mono text-3xl font-bold leading-none text-on-surface">
                {notifications.emailsSentThisMonth.toLocaleString("en-US")}
              </p>
              {charts.projectedEmails !== null && (
                <p className="font-body text-xs text-on-surface-variant">
                  heading for about{" "}
                  <span className="font-mono font-semibold text-on-surface">
                    {charts.projectedEmails.toLocaleString("en-US")}
                  </span>{" "}
                  by the end of {monthLabel}
                </p>
              )}
            </div>
            <div className="mt-4 h-56 w-full">
              <AllowanceChartBody
                data={charts.emailBurn}
                allowance={notifications.emailAllowance}
              />
            </div>
          </Panel>

          <Panel
            title="File storage"
            icon={HardDrive}
            footnote={
              health.storage
                ? `${health.storage.objectCount.toLocaleString("en-US")} files, measured ${new Date(health.storage.computedAt).toLocaleString()}`
                : undefined
            }
          >
            {health.storage === null ? (
              <>
                <p className="font-mono text-3xl font-bold leading-none text-outline">
                  —
                </p>
                <p className="mt-2 font-body text-sm text-on-surface-variant">
                  Not measured yet. The nightly job records this once it has
                  run.
                </p>
              </>
            ) : (
              <>
                <p className="font-mono text-3xl font-bold leading-none text-on-surface">
                  {formatBytesBinary(health.storage.bytes)}
                </p>
                <div className="mt-4">
                  <Meter
                    used={health.storage.bytes}
                    allowance={health.storageAllowance}
                    usedLabel={formatBytesBinary(health.storage.bytes)}
                    allowanceLabel={
                      health.storageAllowance === null
                        ? ""
                        : formatBytesBinary(health.storageAllowance)
                    }
                  />
                </div>
              </>
            )}
          </Panel>
        </div>
      </Section>

      <Section
        title="Engagement"
        description={`What the church did in ${monthLabel}. A calendar month, not the last 30 days, because it is measured against allowances that reset with the calendar.`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Tile
              icon={UserCheck}
              label="Profiles verified this month"
              value={engagement.verificationsThisMonth}
            />
            <Tile
              icon={Bell}
              label="Notifications sent"
              value={notifications.sentThisMonth}
              hint={`${notifications.recipientsReached.toLocaleString("en-US")} people reached, counted from notifications that record who they reached`}
            />
            {/* Clans are counted so the totals are not quietly short. One
                combined figure rather than twelve bars, because a department
                is what a portal user runs and a clan is not. */}
            <Tile
              icon={MessageSquare}
              label="All clans combined"
              value={
                engagement.clansCombined.messagesSent +
                engagement.clansCombined.activitiesStarting
              }
              hint={`${engagement.clansCombined.messagesSent} messages and ${engagement.clansCombined.activitiesStarting} activities across all twelve clans`}
            />
          </div>

          <Panel
            title="By department"
            icon={MessageSquare}
            className="lg:col-span-2"
            footnote="Ranked by volume, so a department that did nothing this month sits at the bottom with no bar rather than buried in an alphabetical list. Activities are counted by when they start, not when they were created; messages a department deleted are left out."
          >
            {charts.departments.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant">
                No departments exist yet.
              </p>
            ) : (
              <div
                className="w-full"
                // Height grows with the number of departments so every bar
                // keeps the same thickness however many there are.
                style={{
                  height: Math.max(220, charts.departments.length * 30 + 44),
                }}
              >
                <DepartmentChartBody data={charts.departments} />
              </div>
            )}
          </Panel>
        </div>

        <GapLines gaps={gaps} section="engagement" />
        <GapLines gaps={gaps} section="notifications" />
      </Section>

      <Section
        title="Devices"
        description="Phones that reported in the last 30 days. This counts phones, not people, so one person with two phones counts twice."
      >
        <Panel
          title="Platforms and app versions"
          icon={Smartphone}
          footnote="Versions are sorted as text, newest first, rather than by version number."
        >
          <SplitBar
            segments={[
              { label: "Android", value: devices.android, tone: "gold" },
              { label: "iPhone", value: devices.ios, tone: "royal" },
            ]}
          />
          {devices.byVersion.length === 0 ? (
            <p className="mt-4 font-body text-sm text-on-surface-variant">
              No phone has reported in the last 30 days yet.
            </p>
          ) : (
            <ul className="mt-5 space-y-2">
              {devices.byVersion.map((row) => (
                <li key={row.appVersion}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-on-surface">
                      {row.appVersion}
                    </span>
                    <span className="font-mono text-xs font-bold text-on-surface">
                      {row.count}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-high">
                    <div
                      className="h-full rounded-full bg-royal"
                      style={{
                        width: `${devices.total > 0 ? (row.count / devices.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5">
            <ConsoleLinks
              links={[
                { label: "Google Play Console", href: devices.playConsoleUrl },
                { label: "App Store Connect", href: devices.appStoreUrl },
              ]}
            />
          </div>
          <GapLines gaps={gaps} section="devices" />
        </Panel>
      </Section>

      <Section title="Health">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tile
            icon={health.failedEmailsLast7Days > 0 ? MailWarning : CheckCircle2}
            label="Emails that failed, last 7 days"
            value={health.failedEmailsLast7Days}
            tone={health.failedEmailsLast7Days > 0 ? "crimson" : "neutral"}
          />
          <Tile
            icon={CalendarDays}
            label="Storage last measured"
            value={
              health.storage
                ? new Date(health.storage.computedAt).toLocaleDateString(
                    "en-GB",
                    {
                      day: "numeric",
                      month: "short",
                      timeZone: "Africa/Kampala",
                    },
                  )
                : "Never"
            }
            hint="The nightly job runs at 05:10 Kampala"
          />
        </div>
        <ConsoleLinks links={[{ label: "Sentry", href: health.sentryUrl }]} />
      </Section>
    </div>
  );
}

// ── Chart data ────────────────────────────────────────────────────────────

type Analytics = NonNullable<
  FunctionReturnType<typeof api.analytics.getPlatformAnalytics>
>;

interface ChartData {
  growth: { dateKey: string; signups: number; total: number }[];
  recency: { label: string; count: number }[];
  emailBurn: {
    dateKey: string;
    cumulative: number | null;
    projected: number | null;
  }[];
  projectedEmails: number | null;
  departments: { name: string; messages: number; activities: number }[];
}

/** "2026-10-31" plus n days, as a date key. Pure calendar arithmetic on a
 *  key that already carries no timezone, so UTC is the right clock here. */
function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

function buildChartData(analytics: Analytics): ChartData {
  const { people, activity, notifications, engagement } = analytics;

  // The running total is anchored so it finishes at today's real account
  // count: the base is what the total must have been before this window, so
  // the line's last point and the headline tile can never disagree.
  const signedUpInWindow = people.signupsByDay.reduce(
    (sum, day) => sum + day.count,
    0,
  );
  let running = people.totalAccounts - signedUpInWindow;
  const growth = people.signupsByDay.map((day) => {
    running += day.count;
    return { dateKey: day.dateKey, signups: day.count, total: running };
  });

  // Subtracting the nested windows partitions every account exactly once.
  // Clamped at zero only as a guard: the server counts all four from the same
  // live-user set, so a negative here would mean a real bug, not a stale read.
  const recency = [
    { label: "Today", count: activity.activeToday },
    {
      label: "2–7 days ago",
      count: Math.max(activity.activeLast7Days - activity.activeToday, 0),
    },
    {
      label: "8–30 days ago",
      count: Math.max(
        activity.activeLast30Days - activity.activeLast7Days,
        0,
      ),
    },
    {
      label: "Not in 30 days",
      count: Math.max(people.totalAccounts - activity.activeLast30Days, 0),
    },
  ];

  // Running total of emails, then a straight line at today's daily average
  // carried to the end of the month. The projection starts on the last real
  // day so the dashed line grows out of the solid one rather than floating.
  let emailsSoFar = 0;
  const elapsed = notifications.emailsByDay.map((day) => {
    emailsSoFar += day.count;
    return {
      dateKey: day.dateKey,
      cumulative: emailsSoFar as number | null,
      projected: null as number | null,
    };
  });

  let projectedEmails: number | null = null;
  const emailBurn = [...elapsed];

  if (elapsed.length > 0 && notifications.monthDaysElapsed > 0) {
    const perDay = emailsSoFar / notifications.monthDaysElapsed;
    projectedEmails = Math.round(perDay * notifications.monthDaysTotal);

    emailBurn[emailBurn.length - 1] = {
      ...emailBurn[emailBurn.length - 1],
      projected: emailsSoFar,
    };

    const lastKey = elapsed[elapsed.length - 1].dateKey;
    const remaining =
      notifications.monthDaysTotal - notifications.monthDaysElapsed;
    for (let ahead = 1; ahead <= remaining; ahead++) {
      emailBurn.push({
        dateKey: addDays(lastKey, ahead),
        // Null rather than zero: the rest of the month has not happened, and
        // a zero would draw the solid line straight down off a cliff.
        cumulative: null,
        projected: Math.round(
          perDay * (notifications.monthDaysElapsed + ahead),
        ),
      });
    }
  }

  const departments = [...engagement.byDepartment]
    .map((row) => ({
      name: row.name,
      messages: row.messagesSent,
      activities: row.activitiesStarting,
    }))
    // Ascending, because a horizontal Recharts axis draws the first row at the
    // bottom: this puts the busiest department at the top of the chart and the
    // silent ones at the bottom, which is the order somebody reads it in.
    .sort((a, b) => a.messages + a.activities - (b.messages + b.activities));

  return { growth, recency, emailBurn, projectedEmails, departments };
}

// ── Attention ─────────────────────────────────────────────────────────────

interface AttentionItem {
  key: string;
  icon: LucideIcon;
  tone: Exclude<TileTone, "neutral" | "royal">;
  text: string;
  href?: string | null;
  linkLabel?: string;
}

/**
 * The things waiting for somebody, worked out from figures the page already
 * has.
 *
 * Deliberately a short list with a high bar. Anything permanently true would
 * train the reader to scroll past the whole strip, so a condition only earns a
 * line when it is genuinely unusual and genuinely actionable. Crimson is for
 * something already wrong; gold is for something that will be wrong soon.
 */
function attentionItems({
  people,
  notifications,
  health,
  charts,
}: {
  people: { pendingVerification: number };
  notifications: { emailsSentThisMonth: number; emailAllowance: number | null };
  health: {
    failedEmailsLast7Days: number;
    sentryUrl: string | null;
    storage: { bytes: number } | null;
    storageAllowance: number | null;
  };
  charts: ChartData;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (people.pendingVerification > 0) {
    items.push({
      key: "pending",
      icon: UserCheck,
      tone: "gold",
      text: `${people.pendingVerification} profile${people.pendingVerification === 1 ? " is" : "s are"} waiting on verification.`,
      href: "/areas-of-service/admin/verification",
      linkLabel: "Open verification",
    });
  }

  if (health.failedEmailsLast7Days > 0) {
    items.push({
      key: "failed-email",
      icon: MailWarning,
      tone: "crimson",
      text: `${health.failedEmailsLast7Days} email${health.failedEmailsLast7Days === 1 ? "" : "s"} failed to send in the last 7 days.`,
      href: health.sentryUrl,
      linkLabel: "Open Sentry",
    });
  }

  if (
    notifications.emailAllowance !== null &&
    notifications.emailAllowance > 0
  ) {
    const allowance = notifications.emailAllowance;
    const used = notifications.emailsSentThisMonth / allowance;

    if (used >= 1) {
      items.push({
        key: "email-allowance",
        icon: Mail,
        tone: "crimson",
        text: `This month's email allowance is used up (${notifications.emailsSentThisMonth.toLocaleString("en-US")} of ${allowance.toLocaleString("en-US")}).`,
      });
    } else if (used >= 0.75) {
      items.push({
        key: "email-allowance",
        icon: Mail,
        tone: "gold",
        text: `${Math.round(used * 100)}% of this month's email allowance is gone.`,
      });
    } else if (
      // The projection earns a warning of its own: sending is still well
      // inside the allowance today, but at this rate it will not be by the
      // end of the month, and that is worth knowing while there is still time
      // to do something about it.
      charts.projectedEmails !== null &&
      charts.projectedEmails > allowance
    ) {
      items.push({
        key: "email-projection",
        icon: TrendingUp,
        tone: "gold",
        text: `At this month's rate, emails will reach about ${charts.projectedEmails.toLocaleString("en-US")} against an allowance of ${allowance.toLocaleString("en-US")}.`,
      });
    }
  }

  if (
    health.storage &&
    health.storageAllowance !== null &&
    health.storageAllowance > 0
  ) {
    const used = health.storage.bytes / health.storageAllowance;
    if (used >= 0.75) {
      items.push({
        key: "storage-allowance",
        icon: HardDrive,
        tone: used >= 1 ? "crimson" : "gold",
        text: `File storage is at ${Math.round(used * 100)}% of the recorded allowance.`,
      });
    }
  }

  return items;
}

const ATTENTION_TONES: Record<"gold" | "crimson", string> = {
  gold: "bg-primary-light border-primary/30 text-primary",
  crimson: "bg-crimson-light border-crimson/30 text-crimson",
};

function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface-low px-4 py-3">
        <CheckCircle2
          className="size-4 shrink-0 text-on-surface-variant"
          strokeWidth={2.25}
          aria-hidden
        />
        <p className="font-body text-sm text-on-surface-variant">
          Nothing needs your attention right now.
        </p>
      </div>
    );
  }

  return (
    <Reveal className="space-y-2">
      {items.map((item) => (
        <div
          key={item.key}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-3",
            ATTENTION_TONES[item.tone],
          )}
        >
          <item.icon
            className="size-4 shrink-0"
            strokeWidth={2.25}
            aria-hidden
          />
          <p className="font-body text-sm font-medium text-on-surface">
            {item.text}
          </p>
          {item.href && (
            <AttentionLink href={item.href} label={item.linkLabel ?? "Open"} />
          )}
        </div>
      ))}
    </Reveal>
  );
}

/**
 * An internal route uses the router; a recorded console URL is somebody else's
 * site and opens in its own tab.
 */
function AttentionLink({ href, label }: { href: string; label: string }) {
  const className =
    "ml-auto font-body text-sm font-semibold underline-offset-2 hover:underline";

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {label} →
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label} →
    </a>
  );
}

// ── Small shared pieces ───────────────────────────────────────────────────

/** A labelled figure inside a panel, for a number that does not earn a tile. */
function MiniRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-2 font-body text-xs text-on-surface-variant">
        <Icon
          className="size-3.5 shrink-0 text-outline"
          strokeWidth={2.25}
          aria-hidden
        />
        {label}
      </dt>
      <dd className="font-mono text-sm font-bold text-on-surface">
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

/**
 * Links out to a service's own console, taken from the cost register.
 *
 * A link is only ever rendered when the register carries one, and the
 * mutation has already guaranteed it is https. When it is missing the section
 * says where to add it rather than rendering a dead anchor.
 */
function ConsoleLinks({
  links,
}: {
  links: { label: string; href: string | null }[];
}) {
  const present = links.filter((link) => link.href !== null);
  const missing = links.filter((link) => link.href === null);

  return (
    <div className="space-y-1.5">
      {present.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {present.map((link) => (
            <a
              key={link.label}
              href={link.href as string}
              target="_blank"
              rel="noreferrer"
              className="font-body text-sm font-semibold text-primary hover:underline"
            >
              {link.label} →
            </a>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="font-body text-xs text-outline">
          No link recorded for {missing.map((l) => l.label).join(" or ")}. Add
          the console link on the Costs page.
        </p>
      )}
    </div>
  );
}

/**
 * The honest-gap lines for one section (AC-9).
 *
 * A muted sentence, never a tile with a dash and never a zero: the whole point
 * is that a System Admin can tell "nobody did this" apart from "we have not
 * built the counter yet", and a zero cannot say the second thing.
 */
function GapLines({
  gaps,
  section,
}: {
  gaps: { key: string; section: string; label: string; sentence: string }[];
  section: string;
}) {
  const mine = gaps.filter((gap) => gap.section === section);
  if (mine.length === 0) return null;

  return (
    <ul className="mt-4 space-y-1.5">
      {mine.map((gap) => (
        <li
          key={gap.key}
          className="flex gap-2 font-body text-xs text-on-surface-variant"
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-outline"
            strokeWidth={2.25}
            aria-hidden
          />
          <span>
            <span className="font-semibold text-on-surface">{gap.label}:</span>{" "}
            {gap.sentence}
          </span>
        </li>
      ))}
    </ul>
  );
}
