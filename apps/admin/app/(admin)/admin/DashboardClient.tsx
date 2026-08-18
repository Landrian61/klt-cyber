"use client";

import Link from "next/link";
import {
  ClipboardCheck,
  Building2,
  Landmark,
  PhoneCall,
  ArrowRight,
} from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Heading } from "@/components/ui/Heading";
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
import { PendingSubmissionsChart } from "./PendingSubmissionsChart";

// Tonal icon chips — semantic token pairs, never a raw Tailwind palette.
const CHIP_TONES = {
  gold: "bg-primary-light text-primary",
  royal: "bg-royal-light text-royal",
  success: "bg-success-light text-success",
} as const;

// The bespoke StatCard (@/components/ui/StatCard) has no icon or link
// affordance, so this dashboard keeps a local wrapper — but wears the same
// Sacred Curator skin: lifted parchment, ambient shadow, no border, and the
// count set in the mono face.
function StatTile({
  href,
  icon: Icon,
  tone,
  label,
  value,
  flag,
}: {
  href: string;
  icon: React.ElementType;
  tone: keyof typeof CHIP_TONES;
  label: string;
  value: number | undefined;
  flag?: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-4 rounded-md bg-surface-lowest p-6 shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e2"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            CHIP_TONES[tone],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {flag && (
          <Badge variant="pending">
            <PhoneCall className="mr-1 size-3" aria-hidden="true" />
            {flag}
          </Badge>
        )}
      </div>
      <div>
        <div className="font-mono text-4xl font-bold leading-none text-on-surface">
          {value === undefined ? (
            <Skeleton className="h-9 w-12" />
          ) : (
            // Rolls up on first paint, and tweens again whenever the live
            // Convex count changes — a number that moves reads as an event.
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
  const departments = useAuthQuery(api.departments.listDepartments);
  const facilities = useAuthQuery(api.facilities.listActiveFacilities);

  const needsFollowUp = pending?.filter((p) => !p.mentorshipProofUrl).length;
  const recentPending = pending?.slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Dashboard
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Overview of pending work across Administration.
        </p>
      </header>

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          href="/admin/verification"
          icon={ClipboardCheck}
          tone="gold"
          label="Pending verifications"
          value={pending?.length}
          flag={
            needsFollowUp && needsFollowUp > 0
              ? `${needsFollowUp} need a call`
              : undefined
          }
        />
        <StatTile
          href="/admin/departments"
          icon={Building2}
          tone="royal"
          label="Departments"
          value={departments?.length}
        />
        <StatTile
          href="/admin/facilities"
          icon={Landmark}
          tone="success"
          label="Tower of Faith facilities"
          value={facilities?.length}
        />
      </Reveal>

      <PendingSubmissionsChart profiles={pending} />

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
            // `replayKey` re-runs the stagger when the row set changes, so
            // rows arriving after the skeleton animate in rather than pop.
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
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-low"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={name} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-body text-sm font-medium text-on-surface">
                          {name}
                        </p>
                        <p className="font-body text-xs text-on-surface-variant">
                          Submitted{" "}
                          {new Date(profile._creationTime).toLocaleDateString()}
                          {!profile.mentorshipProofUrl &&
                            " · needs follow-up call"}
                        </p>
                      </div>
                    </div>
                    {/* Link styled as a button — never a <button> inside an
                        <a>, which the previous markup nested. */}
                    <Link
                      href={`/admin/verification/${profile._id}`}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "shrink-0",
                      )}
                    >
                      Review
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </Reveal>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
