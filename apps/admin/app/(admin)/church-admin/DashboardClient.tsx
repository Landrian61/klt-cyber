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
import { Card, Button, Badge } from "./ui";
import { PendingSubmissionsChart } from "./PendingSubmissionsChart";

const CHIP_COLORS = {
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
} as const;

function StatCard({
  href,
  icon: Icon,
  chip,
  label,
  value,
  flag,
}: {
  href: string;
  icon: React.ElementType;
  chip: keyof typeof CHIP_COLORS;
  label: string;
  value: number | undefined;
  flag?: string;
}) {
  return (
    <Link href={href}>
      <Card className="flex flex-col gap-4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center justify-between">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${CHIP_COLORS[chip]}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          {flag && (
            <Badge variant="destructive" className="gap-1">
              <PhoneCall className="h-3 w-3" />
              {flag}
            </Badge>
          )}
        </div>
        <div>
          <p className="font-display text-3xl font-semibold">
            {value === undefined ? (
              <span className="inline-block h-8 w-12 animate-pulse rounded-md bg-muted align-middle" />
            ) : (
              value
            )}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        </div>
      </Card>
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ChurchAdminDashboardClient() {
  const pending = useAuthQuery(api.memberProfiles.listPendingVerifications);
  const departments = useAuthQuery(api.departments.listActiveDepartments);
  const facilities = useAuthQuery(api.facilities.listActiveFacilities);

  const needsFollowUp = pending?.filter((p) => !p.mentorshipProofUrl).length;
  const recentPending = pending?.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-primary)]">
          Overview
        </p>
        <h2 className="font-display text-4xl font-semibold">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of pending work across Church Admin.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          href="/church-admin/verification"
          icon={ClipboardCheck}
          chip="amber"
          label="Pending verifications"
          value={pending?.length}
          flag={
            needsFollowUp && needsFollowUp > 0
              ? `${needsFollowUp} need a call`
              : undefined
          }
        />
        <StatCard
          href="/church-admin/departments"
          icon={Building2}
          chip="blue"
          label="Active departments"
          value={departments?.length}
        />
        <StatCard
          href="/church-admin/facilities"
          icon={Landmark}
          chip="emerald"
          label="Tower of Faith facilities"
          value={facilities?.length}
        />
      </div>

      <PendingSubmissionsChart profiles={pending} />

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">
            Pending Approvals
          </h3>
          {pending && pending.length > 5 && (
            <Link
              href="/church-admin/verification"
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              View all {pending.length}
            </Link>
          )}
        </div>

        {recentPending === undefined && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {recentPending?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No pending profiles right now.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {recentPending?.map((profile) => {
            const name = fullName(profile);
            return (
              <li
                key={profile._id}
                className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-xs font-semibold text-[var(--color-primary)]">
                    {initials(name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Submitted{" "}
                      {new Date(profile._creationTime).toLocaleDateString()}
                      {!profile.mentorshipProofUrl && " · needs follow-up call"}
                    </p>
                  </div>
                </div>
                <Link href={`/church-admin/verification/${profile._id}`}>
                  <Button variant="outline" size="sm" className="gap-1">
                    Review <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
