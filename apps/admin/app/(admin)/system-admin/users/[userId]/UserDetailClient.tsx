"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ageFrom,
  displayName,
  formatDate,
  formatRelativeTime,
} from "@/lib/format";
import { describeActivity } from "@/lib/activity";
import { CardHeading, capitalize, type UserDetail } from "./shared";
import { RolesCard } from "./RolesCard";
import { AccountActionsCard } from "./AccountActionsCard";
import { ClanAffiliationCard } from "./ClanAffiliationCard";

// The richest screen of the module: bio + roles + admin actions, all fed by
// one reactive query — every mutation on the right rail refreshes the whole
// page without manual refetching.
export function UserDetailClient({ userId }: { userId: string }) {
  const detail = useQuery(api.admin.getUserDetail, {
    userId: userId as Id<"users">,
  });

  if (detail === undefined) return <DetailSkeleton />;

  if (detail === null) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          title="User not found"
          message="This account may have been removed."
          action={
            <Link
              href="/system-admin/users"
              className="font-body text-sm font-medium text-primary underline underline-offset-2"
            >
              Back to users
            </Link>
          }
        />
      </div>
    );
  }

  const showClanAffiliation =
    detail.profile?.clanId != null &&
    detail.profile.clanApproval?.status === "pending";

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── Left column: identity + bio ─────────────────────────────── */}
        <div className="space-y-6">
          <HeaderCard detail={detail} />
          <BioCard detail={detail} />
          {detail.profile !== null && detail.children.length > 0 && (
            <ChildrenCard records={detail.children} />
          )}
          <ActivityCard detail={detail} userId={userId} />
        </div>

        {/* ── Right column: the action panel ──────────────────────────── */}
        <div className="space-y-6">
          <RolesCard detail={detail} userId={userId as Id<"users">} />
          <AccountActionsCard detail={detail} userId={userId as Id<"users">} />
          {showClanAffiliation && (
            <ClanAffiliationCard
              detail={detail}
              userId={userId as Id<"users">}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/system-admin/users"
      className="inline-block font-body text-sm text-primary underline underline-offset-2"
    >
      &larr; Users
    </Link>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function HeaderCard({ detail }: { detail: UserDetail }) {
  const { user, profile, signedUpAt } = detail;
  const name = displayName(user);

  return (
    <Card className="flex gap-5">
      <Avatar
        size="xl"
        name={name}
        email={user.email}
        src={user.profilePictureUrl}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <Heading as="h1" size="xl">
          {name}
        </Heading>
        <p className="truncate font-body text-base text-on-surface-variant">
          {user.email}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={user.role}>{capitalize(user.role)}</Badge>
          {user.status === "suspended" && (
            <Badge variant="suspended">Suspended</Badge>
          )}
        </div>
        <p className="font-body text-xs text-outline">
          {profile !== null && (
            <>Member since {formatDate(profile._creationTime)} &middot; </>
          )}
          Signed up {formatDate(signedUpAt)}
        </p>
      </div>
    </Card>
  );
}

// ── Bio ───────────────────────────────────────────────────────────────────

function BioCard({ detail }: { detail: UserDetail }) {
  const { profile } = detail;

  return (
    <Card>
      <CardHeading>Bio</CardHeading>
      {profile === null ? (
        <p className="mt-4 font-body text-sm text-on-surface-variant">
          A visitor &mdash; no member profile yet. Profiles are completed from
          the mobile app.
        </p>
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
          <BioRow label="Sex" value={capitalize(profile.sex)} />
          <BioRow label="Date of birth" value={dobValue(profile.dateOfBirth)} />
          <BioRow
            label="Marital status"
            value={capitalize(profile.maritalStatus)}
          />
          <BioRow label="Phone" value={profile.phone ?? null} />
          <BioRow label="Profession" value={profile.profession ?? null} />
          <BioRow
            label="Clan"
            value={
              profile.clanName ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {profile.clanName}
                  {profile.clanApproval && (
                    <Badge variant={profile.clanApproval.status}>
                      {capitalize(profile.clanApproval.status)}
                    </Badge>
                  )}
                </span>
              ) : null
            }
          />
        </dl>
      )}
    </Card>
  );
}

function BioRow({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <div>
      <dt className="font-body text-xs uppercase tracking-wide text-outline">
        {label}
      </dt>
      <dd className="mt-1 font-body text-sm text-on-surface">
        {value ?? <span className="text-outline">&mdash;</span>}
      </dd>
    </div>
  );
}

/** "12 Jul 1990 · 36 yrs", the raw string when unparseable, null when absent. */
function dobValue(dateOfBirth: string | undefined): ReactNode | null {
  if (!dateOfBirth) return null;
  const time = new Date(dateOfBirth).getTime();
  if (Number.isNaN(time)) return dateOfBirth;
  const age = ageFrom(dateOfBirth);
  return age === null
    ? formatDate(time)
    : `${formatDate(time)} · ${age} yrs`;
}

// ── Children ──────────────────────────────────────────────────────────────

function ChildrenCard({ records }: { records: UserDetail["children"] }) {
  return (
    <Card>
      <CardHeading>Children</CardHeading>
      <div className="mt-3">
        {records.map((child) => (
          <div
            key={child._id}
            className="flex flex-wrap items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-low"
          >
            <span className="font-body text-sm font-medium text-on-surface">
              {child.name}
            </span>
            <Badge variant="neutral">{child.ageBracket}</Badge>
            <span className="font-body text-sm text-on-surface-variant">
              {childDob(child.dateOfBirth)}
            </span>
            <span className="ml-auto font-body text-sm text-on-surface-variant">
              {child.guardianContact ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function childDob(dateOfBirth: string | undefined): string {
  if (!dateOfBirth) return "—";
  const time = new Date(dateOfBirth).getTime();
  return Number.isNaN(time) ? dateOfBirth : formatDate(time);
}

// ── Recent activity ───────────────────────────────────────────────────────

function ActivityCard({
  detail,
  userId,
}: {
  detail: UserDetail;
  userId: string;
}) {
  const entries = detail.recentActivity.slice(0, 15);

  return (
    <Card>
      <CardHeading>Recent activity</CardHeading>
      {entries.length === 0 ? (
        <p className="mt-4 font-body text-sm text-on-surface-variant">
          No recorded activity.
        </p>
      ) : (
        <div className="mt-3">
          {entries.map((entry) => {
            const performed = entry.actor?._id === userId;
            return (
              <div
                key={entry._id}
                className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-low"
              >
                <Badge variant={performed ? "neutral" : "pending"}>
                  {performed ? "did" : "received"}
                </Badge>
                <p className="min-w-0 flex-1 font-body text-sm text-on-surface">
                  {describeActivity(entry)}
                </p>
                <span className="shrink-0 pt-0.5 font-body text-xs text-outline">
                  {formatRelativeTime(entry._creationTime)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Skeleton (mirrors the final layout — no shift on load) ────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-low ${className}`} />;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading user">
      <Pulse className="h-5 w-16" />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Header */}
          <Card className="flex gap-5">
            <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-full bg-surface-low" />
            <div className="flex-1 space-y-3">
              <Pulse className="h-7 w-56" />
              <Pulse className="h-4 w-72" />
              <Pulse className="h-[22px] w-40 rounded-full" />
              <Pulse className="h-3 w-64" />
            </div>
          </Card>

          {/* Bio */}
          <Card>
            <Pulse className="h-5 w-14" />
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Pulse className="h-3 w-24" />
                  <Pulse className="h-4 w-36" />
                </div>
              ))}
            </div>
          </Card>

          {/* Activity */}
          <Card>
            <Pulse className="h-5 w-32" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Pulse key={index} className="h-4 w-full" />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <Pulse className="h-5 w-16" />
            <div className="mt-4 space-y-3">
              <Pulse className="h-4 w-full" />
              <Pulse className="h-4 w-3/4" />
              <Pulse className="h-9 w-full" />
            </div>
          </Card>
          <Card>
            <Pulse className="h-5 w-32" />
            <div className="mt-4 space-y-3">
              <Pulse className="h-8 w-40" />
              <Pulse className="h-3 w-full" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
