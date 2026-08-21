"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { PhoneCall } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/shadcn/avatar";
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
import { Textarea } from "@/components/shadcn/textarea";
import {
  errorMessage,
  fullName,
  toFormState,
  type EditableFields,
} from "../shared";
import { ProfileDetails } from "../ProfileDetails";

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
    <div className="mx-auto max-w-[1600px] space-y-6">
      <BackLink onClick={() => router.push("/admin/verification")} />

      <header className="flex flex-wrap items-center gap-3">
        <Avatar name={fullName(profile)} src={profile.photoUrl} size="lg" />
        <Heading as="h1" size="2xl">
          {fullName(profile)}
        </Heading>
        {needsFollowUp && (
          <Badge variant="pending">
            <PhoneCall className="mr-1 size-3" aria-hidden="true" />
            Needs follow-up call — no mentorship certificate
          </Badge>
        )}
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left: full submitted profile, read-only */}
        <ProfileDetails profile={profile} />

        {/* Right: editable fields + verify action — sticky so it stays in
            view while the (now much longer) left column scrolls. */}
        <div className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <Card className="gap-5 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-body text-lg font-semibold text-on-surface">
                Edit Before Approving
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 p-0">
              <div className="grid grid-cols-2 gap-4">
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
              </div>
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

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <Field label="Short bio" htmlFor="review-short-bio">
                <Textarea
                  id="review-short-bio"
                  rows={3}
                  value={form.shortBio}
                  onChange={(e) => set("shortBio", e.target.value)}
                />
              </Field>

              <Separator />

              <Field label="Occupation" htmlFor="review-occupation">
                <Input
                  id="review-occupation"
                  value={form.occupation}
                  onChange={(e) => set("occupation", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
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

// Mirrors the final layout so nothing shifts on load.
function ReviewSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1600px] space-y-6"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-64" />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </div>
        <Skeleton className="h-96 rounded-md" />
      </div>
    </div>
  );
}