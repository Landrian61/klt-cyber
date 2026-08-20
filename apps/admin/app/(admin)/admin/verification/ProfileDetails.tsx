"use client";

import type { ReactNode } from "react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Badge } from "@/components/shadcn/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { capitalize, formatAddress, formatDateOfBirth } from "./shared";
import type { ProfileForReview } from "./shared";

// Every field a member can submit through the mobile 7-step wizard
// (convex/schema.ts `memberProfiles`), laid out for review. Shared by
// Review mode and the profile detail page so "all submitted info is visible
// on review" can't quietly drift out of sync between the two screens.
export function ProfileDetails({ profile }: { profile: ProfileForReview }) {
  const clans = useAuthQuery(api.clans.listClans);
  const clanName = profile.clanId
    ? (clans?.find((c) => c._id === profile.clanId)?.name ?? "—")
    : null;

  const dob = formatDateOfBirth(profile.dateOfBirth);
  const address = formatAddress(profile.address);
  const spouseName = profile.spouseName ?? profile.spouseNameUnlinked ?? null;

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailRow label="Date of birth">{dob}</DetailRow>
            <DetailRow label="Sex">{capitalize(profile.sex)}</DetailRow>
            <DetailRow label="Marital status">
              {capitalize(profile.maritalStatus)}
            </DetailRow>
            <DetailRow label="Phone">{profile.phone}</DetailRow>
            <DetailRow label="Submitted">
              {new Date(profile._creationTime).toLocaleString()}
            </DetailRow>
            <DetailRow label="Join date">
              {profile.joinDate
                ? new Date(profile.joinDate).toLocaleDateString()
                : null}
            </DetailRow>
          </dl>
          {profile.shortBio && (
            <div className="mt-4">
              <dt className="font-body text-xs uppercase tracking-wide text-outline">
                Short bio
              </dt>
              <dd className="mt-1 font-body text-sm text-on-surface">
                {profile.shortBio}
              </dd>
            </div>
          )}
        </CardContent>
      </Card>

      {address && (
        <Card className="gap-5 p-6">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-lg font-semibold text-on-surface">
              Address
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <p className="font-body text-sm text-on-surface">{address}</p>
          </CardContent>
        </Card>
      )}

      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Family
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailRow label="Spouse">{spouseName}</DetailRow>
            {profile.anniversaryDate && (
              <DetailRow label="Anniversary">
                {new Date(profile.anniversaryDate).toLocaleDateString()}
              </DetailRow>
            )}
            {profile.nextOfKin && (
              <>
                <DetailRow label="Next of kin">
                  {profile.nextOfKin.fullName}
                </DetailRow>
                <DetailRow label="Relationship">
                  {profile.nextOfKin.relationship}
                </DetailRow>
                <DetailRow label="Next of kin phone">
                  {profile.nextOfKin.phone}
                </DetailRow>
              </>
            )}
          </dl>

          <div>
            <dt className="font-body text-xs uppercase tracking-wide text-outline">
              Children
            </dt>
            {profile.children.length === 0 ? (
              <p className="mt-1 font-body text-sm text-on-surface-variant">
                None on this profile.
              </p>
            ) : (
              <ul className="mt-1">
                {profile.children.map((child, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-low"
                  >
                    <span className="font-body text-sm text-on-surface">
                      {child.name}
                      {child.dateOfBirth && (
                        <span className="text-on-surface-variant">
                          {" "}
                          &middot;{" "}
                          {new Date(child.dateOfBirth).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                    <Badge variant="neutral" className="capitalize">
                      {child.sex}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Clan &amp; Profession
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailRow label="Clan">{clanName}</DetailRow>
            <DetailRow label="Occupation">{profile.occupation}</DetailRow>
            <DetailRow label="Industry">{profile.industry}</DetailRow>
            <DetailRow label="Employer">{profile.employer}</DetailRow>
          </dl>
          {profile.skills && profile.skills.length > 0 && (
            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-outline">
                Skills
              </dt>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {profile.skills.map((skill, i) => (
                  <Badge key={i} variant="neutral">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Mentorship &amp; Leadership
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailRow label="Mentorship status">
              {capitalize(profile.mentorshipStatus.replace("_", " "))}
            </DetailRow>
            <DetailRow label="Certificate">
              {profile.mentorshipProofUrl ? (
                <a
                  href={profile.mentorshipProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  View certificate
                </a>
              ) : (
                "Not submitted"
              )}
            </DetailRow>
          </dl>

          {profile.leadershipProgress.length > 0 && (
            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-outline">
                Leadership Institute progress
              </dt>
              <ul className="mt-1">
                {profile.leadershipProgress.map((entry, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-low"
                  >
                    <span className="font-body text-sm capitalize text-on-surface">
                      {entry.level.replace("_", " ")}
                    </span>
                    <Badge variant="neutral" className="capitalize">
                      {entry.status.replace("_", " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="font-body text-xs uppercase tracking-wide text-outline">
        {label}
      </dt>
      <dd className="mt-1 font-body text-sm text-on-surface">
        {children ?? <span className="text-outline">&mdash;</span>}
      </dd>
    </div>
  );
}
