"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { PhoneCall } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import { capitalize, errorMessage, type ProfileForReview } from "../shared";

// The subset of `memberProfiles` fields an admin can correct before
// approving, per `profileEditsPatchValidator` in convex/memberProfiles.ts.
// Nested/structured fields (dateOfBirth, nextOfKin, skills) are shown
// read-only for now — worth dedicated editors in a follow-up pass.
type EditableFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  sex: "male" | "female";
  maritalStatus: "single" | "married" | "widowed" | "divorced";
  occupation: string;
  industry: string;
  employer: string;
  shortBio: string;
};

function toFormState(profile: ProfileForReview): EditableFields {
  return {
    firstName: profile.firstName,
    middleName: profile.middleName ?? "",
    lastName: profile.lastName,
    phone: profile.phone ?? "",
    sex: profile.sex,
    maritalStatus: profile.maritalStatus,
    occupation: profile.occupation ?? "",
    industry: profile.industry ?? "",
    employer: profile.employer ?? "",
    shortBio: profile.shortBio ?? "",
  };
}

export function ProfileReviewClient({ profileId }: { profileId: string }) {
  const router = useRouter();
  const id = profileId as Id<"memberProfiles">;
  const profile = useAuthQuery(api.memberProfiles.getProfileForReview, {
    profileId: id,
  });
  const verifyProfile = useMutation(api.memberProfiles.verifyProfile);

  const [form, setForm] = useState<EditableFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (profile) setForm(toFormState(profile));
  }, [profile]);

  // `null` = no such profile (or the query resolved unauthenticated during
  // sign-out teardown). This must be checked BEFORE the loading guard: `form`
  // is only populated from a truthy profile, so `form === null` stays true
  // forever in this case and would otherwise pin the screen to a skeleton.
  if (profile === null) {
    return (
      <div className="space-y-6">
        <BackLink onClick={() => router.push("/admin/verification")} />
        <EmptyState
          title="Profile unavailable"
          message="This profile no longer exists or has already been reviewed."
        />
      </div>
    );
  }

  if (profile === undefined || form === null) {
    return <ReviewSkeleton />;
  }

  const needsFollowUp = !profile.mentorshipProofUrl;
  const dirty = JSON.stringify(form) !== JSON.stringify(toFormState(profile));

  function set<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleVerify() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      await verifyProfile({
        profileId: id,
        edits: dirty
          ? {
              firstName: form.firstName,
              middleName: form.middleName || undefined,
              lastName: form.lastName,
              phone: form.phone || undefined,
              sex: form.sex,
              maritalStatus: form.maritalStatus,
              occupation: form.occupation || undefined,
              industry: form.industry || undefined,
              employer: form.employer || undefined,
              shortBio: form.shortBio || undefined,
            }
          : undefined,
      });
      setConfirmOpen(false);
      router.push("/admin/verification");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink onClick={() => router.push("/admin/verification")} />

      <header className="flex flex-wrap items-center gap-3">
        <Heading as="h1" size="2xl">
          {profile.firstName} {profile.lastName}
        </Heading>
        {needsFollowUp && (
          <Badge variant="pending">
            <PhoneCall className="mr-1 size-3" aria-hidden="true" />
            Needs follow-up call — no mentorship certificate
          </Badge>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Left: read-only context */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="gap-5 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-body text-lg font-semibold text-on-surface">
                Submission Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
                <DetailRow label="Submitted">
                  {new Date(profile._creationTime).toLocaleString()}
                </DetailRow>
                <DetailRow label="Join date">
                  {profile.joinDate
                    ? new Date(profile.joinDate).toLocaleDateString()
                    : null}
                </DetailRow>
              </dl>
            </CardContent>
          </Card>

          <Card className="gap-5 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-body text-lg font-semibold text-on-surface">
                Family
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {profile.children.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant">
                  No children on this profile.
                </p>
              ) : (
                <ul>
                  {profile.children.map((child, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-low"
                    >
                      <span className="font-body text-sm text-on-surface">
                        {child.name}
                      </span>
                      <Badge variant="neutral" className="capitalize">
                        {child.sex}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {profile.leadershipProgress.length > 0 && (
            <Card className="gap-5 p-6">
              <CardHeader className="p-0">
                <CardTitle className="font-body text-lg font-semibold text-on-surface">
                  Leadership Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul>
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
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: editable fields + verify action */}
        <div className="space-y-6">
          <Card className="gap-5 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-body text-lg font-semibold text-on-surface">
                Edit Before Approving
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 p-0">
              <Field label="First name" htmlFor="review-first-name">
                <Input
                  id="review-first-name"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label="Middle name" htmlFor="review-middle-name">
                <Input
                  id="review-middle-name"
                  value={form.middleName}
                  onChange={(e) => set("middleName", e.target.value)}
                />
              </Field>
              <Field label="Last name" htmlFor="review-last-name">
                <Input
                  id="review-last-name"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="review-phone">
                <Input
                  id="review-phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>

              <Field label="Sex" htmlFor="review-sex">
                <Select
                  value={form.sex}
                  onValueChange={(v) => set("sex", v as EditableFields["sex"])}
                >
                  <SelectTrigger id="review-sex">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Marital status" htmlFor="review-marital-status">
                <Select
                  value={form.maritalStatus}
                  onValueChange={(v) =>
                    set("maritalStatus", v as EditableFields["maritalStatus"])
                  }
                >
                  <SelectTrigger id="review-marital-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married">Married</SelectItem>
                    <SelectItem value="widowed">Widowed</SelectItem>
                    <SelectItem value="divorced">Divorced</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Separator />

              <Field label="Occupation" htmlFor="review-occupation">
                <Input
                  id="review-occupation"
                  value={form.occupation}
                  onChange={(e) => set("occupation", e.target.value)}
                />
              </Field>
              <Field label="Industry" htmlFor="review-industry">
                <Input
                  id="review-industry"
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                />
              </Field>
              <Field label="Employer" htmlFor="review-employer">
                <Input
                  id="review-employer"
                  value={form.employer}
                  onChange={(e) => set("employer", e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="gap-4 p-6">
            {error && (
              <CardContent className="p-0">
                <p className="font-body text-sm text-error">{error}</p>
              </CardContent>
            )}
            <CardFooter className="p-0">
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
              >
                Verify &amp; Approve
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Consequential action: confirm in a centered Dialog. */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve this profile?</DialogTitle>
            <DialogDescription>
              {form.firstName} {form.lastName} will be promoted from visitor to
              member.
              {dirty && " Your edits will be saved along with the approval."}
              {needsFollowUp &&
                " No mentorship certificate is on file — confirm the manual follow-up call happened before approving."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={handleVerify}>
              Confirm approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Quiet text-link back affordance (matches the system-admin detail screens).
// Kept as a button so the existing router.push navigation is untouched.
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-block font-body text-sm text-primary underline underline-offset-2"
    >
      &larr; Pending Verifications
    </button>
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

// Mirrors the final layout so nothing shifts on load.
function ReviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading profile">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-64" />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
