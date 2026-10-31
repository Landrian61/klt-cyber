"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import * as Sentry from "@sentry/nextjs";
import { PhoneCall, Undo2 } from "lucide-react";
import {
  profileLifecycleErrorCode,
  profileLifecycleErrorMessage,
  profileStaleCause,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { fullName, toFormState, type EditableFields } from "./shared";
import { ProfileDetails } from "./ProfileDetails";

// Review mode is Approve / Skip, deliberately: it is the fast walk through the
// queue, and sending a profile back needs a written reason, which belongs on
// the detail page where there is room to type one. A reviewer who wants to
// send this one back opens it there.
//
// It does show what it needs to decide: the "Resubmitted" marker and the
// reason from the last round. The old comment here said memberProfiles has no
// sent-back status, which spec 0014 made false.
export function ReviewMode({
  profileIds,
  onExit,
}: {
  profileIds: Id<"memberProfiles">[];
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const total = profileIds.length;
  const currentId = profileIds[index];

  const profile = useAuthQuery(
    api.memberProfiles.getProfileForReview,
    currentId ? { profileId: currentId } : "skip",
  );
  const verifyProfile = useMutation(api.memberProfiles.verifyProfile);

  const [form, setForm] = useState<EditableFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || !currentId) return;
    // Once per profile in the queue, so a push from the owner neither moves
    // the baseline nor discards the reviewer's typing.
    if (seenRef.current?.id !== currentId) {
      seenRef.current = { id: currentId, updatedAt: profile.updatedAt };
      setForm(toFormState(profile));
    }
  }, [profile, currentId]);

  /**
   * The row version this reviewer started from, frozen per profile.
   *
   * Same reason as `ProfileReviewClient`: the query is live, so reading
   * `updatedAt` at click time always matches the stored row and the guard
   * never fires. Keyed by id because review mode walks a queue and each
   * profile needs its own baseline.
   */
  const seenRef = useRef<{ id: string; updatedAt: number } | null>(null);
  const seenUpdatedAt =
    seenRef.current && currentId && seenRef.current.id === currentId
      ? seenRef.current.updatedAt
      : profile?.updatedAt;

  useEffect(() => {
    // Profile already handled elsewhere mid-session (e.g. reviewed on
    // another tab) — move on rather than stall the queue on a dead id.
    if (profile === null) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (total === 0) {
    return (
      <EmptyState title="Nothing to review" message="The queue is empty." />
    );
  }

  function advance() {
    setForm(null);
    setError(false);
    setRefusal(null);
    if (index + 1 >= total) {
      onExit();
    } else {
      setIndex((i) => i + 1);
    }
  }

  function set<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleApprove() {
    if (!currentId || !form || !profile) return;
    setBusy(true);
    setError(false);
    setRefusal(null);
    const dirty = JSON.stringify(form) !== JSON.stringify(toFormState(profile));
    try {
      await verifyProfile({
        profileId: currentId,
        // The frozen version this reviewer started from (spec 0014, AC-7).
        // Review mode moves fast through a queue, so it is exactly where a
        // reviewer is most likely to be holding a version the owner has since
        // edited.
        seenUpdatedAt: seenUpdatedAt ?? profile.updatedAt,
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
      advance();
    } catch (err) {
      const code = profileLifecycleErrorCode(err);
      if (code) {
        // A rule the server applied on purpose. The reactive query means the
        // screen is already showing the new state by the time the reviewer
        // reads this, so it stays on this profile rather than advancing.
        setRefusal(
          profileLifecycleErrorMessage(
            err,
            profileStaleCause(profile.sentBackAt, seenUpdatedAt ?? profile.updatedAt),
          ),
        );
      } else {
        // A rejected mutation in an event handler never reaches a React error
        // boundary — reported directly from the catch that already exists here.
        Sentry.captureException(err);
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <p className="text-center font-body text-sm text-on-surface-variant">
        Review mode — one at a time
      </p>

      {profile == null || form === null ? (
        <ReviewModeSkeleton />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* Left: full submitted profile, read-only */}
          <div className="space-y-4">
            <Card className="gap-4 p-6">
              <CardHeader className="flex-row items-center gap-4 p-0">
                <Avatar name={fullName(profile)} src={profile.photoUrl} size="lg" />
                <div className="space-y-1">
                  <CardTitle className="font-body text-lg font-semibold text-on-surface">
                    {fullName(profile)}
                  </CardTitle>
                  <p className="font-mono text-xs text-on-surface-variant">
                    {index + 1} of {total}
                  </p>
                </div>
                {profile.isResubmission && (
                  <Badge variant="neutral" className="ml-auto">
                    <Undo2 className="mr-1 size-3" aria-hidden="true" />
                    Resubmitted
                  </Badge>
                )}
                {!profile.mentorshipProofUrl && (
                  <Badge
                    variant="pending"
                    className={profile.isResubmission ? undefined : "ml-auto"}
                  >
                    <PhoneCall className="mr-1 size-3" aria-hidden="true" />
                    Needs follow-up call
                  </Badge>
                )}
              </CardHeader>
            </Card>
            {/* What was asked for last time (AC-5), in review mode too: a
                reviewer deciding fast is the one most likely to re-send the
                same note they already sent. */}
            {profile.sentBackReason && (
              <Card className="gap-2 border-primary/40 bg-primary-light p-5">
                <CardHeader className="p-0">
                  <CardTitle className="font-body text-sm font-semibold text-primary">
                    What you asked for last time
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="font-body text-base text-on-surface">
                    {profile.sentBackReason}
                  </p>
                </CardContent>
              </Card>
            )}
            <ProfileDetails profile={profile} />
          </div>

          {/* Right: editable fields + approve/skip — sticky so it stays in
              view while the (now much longer) left column scrolls. */}
          <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            <Card className="gap-5 p-6">
              <CardHeader className="p-0">
                <CardTitle className="font-body text-lg font-semibold text-on-surface">
                  Edit Before Approving
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First name" htmlFor="rm-first-name">
                    <Input
                      id="rm-first-name"
                      value={form.firstName}
                      onChange={(e) => set("firstName", e.target.value)}
                    />
                  </Field>
                  <Field label="Middle name" htmlFor="rm-middle-name">
                    <Input
                      id="rm-middle-name"
                      value={form.middleName}
                      onChange={(e) => set("middleName", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Last name" htmlFor="rm-last-name">
                  <Input
                    id="rm-last-name"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                  />
                </Field>
                <Field label="Phone" htmlFor="rm-phone">
                  <Input
                    id="rm-phone"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Sex" htmlFor="rm-sex">
                    <Select
                      value={form.sex}
                      onValueChange={(v) =>
                        set("sex", v as EditableFields["sex"])
                      }
                    >
                      <SelectTrigger id="rm-sex">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Marital status" htmlFor="rm-marital">
                    <Select
                      value={form.maritalStatus}
                      onValueChange={(v) =>
                        set("maritalStatus", v as EditableFields["maritalStatus"])
                      }
                    >
                      <SelectTrigger id="rm-marital">
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

                <Field label="Short bio" htmlFor="rm-short-bio">
                  <Textarea
                    id="rm-short-bio"
                    rows={3}
                    value={form.shortBio}
                    onChange={(e) => set("shortBio", e.target.value)}
                  />
                </Field>

                <Separator />

                <Field label="Occupation" htmlFor="rm-occupation">
                  <Input
                    id="rm-occupation"
                    value={form.occupation}
                    onChange={(e) => set("occupation", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Industry" htmlFor="rm-industry">
                    <Input
                      id="rm-industry"
                      value={form.industry}
                      onChange={(e) => set("industry", e.target.value)}
                    />
                  </Field>
                  <Field label="Employer" htmlFor="rm-employer">
                    <Input
                      id="rm-employer"
                      value={form.employer}
                      onChange={(e) => set("employer", e.target.value)}
                    />
                  </Field>
                </div>

                {refusal && (
                  <p
                    role="status"
                    className="rounded-md bg-warning-light p-3 font-body text-sm text-on-surface"
                  >
                    {refusal}
                  </p>
                )}
                {error && <ErrorState cause="generic" retry={handleApprove} />}
              </CardContent>
              <CardFooter className="flex flex-col gap-3 p-0 pt-2">
                <Button
                  className="w-full"
                  loading={busy}
                  disabled={busy}
                  onClick={handleApprove}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={advance}
                >
                  Skip
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={onExit}
          className="font-body text-sm text-primary underline underline-offset-2"
        >
          Exit to list
        </button>
      </div>
    </div>
  );
}

// Mirrors the final layout so nothing shifts on load.
function ReviewModeSkeleton() {
  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className="space-y-4">
        <Card className="gap-4 p-6">
          <CardContent className="flex flex-row items-center gap-4 p-0">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </CardContent>
        </Card>
        <Skeleton className="h-64 rounded-md" />
        <Skeleton className="h-40 rounded-md" />
      </div>
      <Skeleton className="h-96 rounded-md" />
    </div>
  );
}
