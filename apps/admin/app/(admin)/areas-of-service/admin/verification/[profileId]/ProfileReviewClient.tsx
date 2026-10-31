"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import * as Sentry from "@sentry/nextjs";
import { PhoneCall, Undo2 } from "lucide-react";
import {
  REVIEWER_NAME,
  SENT_BACK_REASON_MAX_LENGTH,
  SENT_BACK_REASON_MIN_LENGTH,
  profileLifecycleErrorCode,
  profileLifecycleErrorMessage,
  profileStaleCause,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
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
import { fullName, toFormState, type EditableFields } from "../shared";
import { ProfileDetails } from "../ProfileDetails";

export function ProfileReviewClient({ profileId }: { profileId: string }) {
  const router = useRouter();
  const id = profileId as Id<"memberProfiles">;
  const profile = useAuthQuery(api.memberProfiles.getProfileForReview, {
    profileId: id,
  });
  const verifyProfile = useMutation(api.memberProfiles.verifyProfile);
  const sendProfileBack = useMutation(api.memberProfiles.sendProfileBack);

  const [form, setForm] = useState<EditableFields | null>(null);
  /**
   * The row version this reviewer STARTED from, frozen on first load.
   *
   * It cannot come from `profile.updatedAt`, because `useAuthQuery` is a live
   * subscription: when the owner edits mid review, this component re-renders
   * with the owner's NEW `updatedAt`, so the value sent to the server would
   * always match the stored row and the guard would never fire. Freezing it is
   * what makes AC-7's check real rather than decoration.
   */
  const seenRef = useRef<number | null>(null);
  /** The form as it was seeded, so `dirty` means "the reviewer typed", not "the owner wrote". */
  const baselineRef = useRef<EditableFields | null>(null);
  /** Set once the owner has written while this screen was open. */
  const [ownerMovedIt, setOwnerMovedIt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // A coded refusal gets its own sentence; `error` stays for the generic
  // ErrorState, because an unrecognised failure is a different thing from a
  // rule the server applied on purpose.
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!profile) return;
    // Seed the form ONCE. Re-seeding on every push threw away whatever the
    // reviewer had typed, with nothing on screen to say it had happened.
    if (seenRef.current === null) {
      seenRef.current = profile.updatedAt;
      baselineRef.current = toFormState(profile);
      setForm(toFormState(profile));
      return;
    }
    // A later push means somebody else wrote. Keep the reviewer's typing and
    // warn them instead, so they can decide what to do with it.
    if (profile.updatedAt > seenRef.current) setOwnerMovedIt(true);
  }, [profile]);

  // `null` = no such profile (or the query resolved unauthenticated during
  // sign-out teardown). This must be checked BEFORE the loading guard: `form`
  // is only populated from a truthy profile, so `form === null` stays true
  // forever in this case and would otherwise pin the screen to a skeleton.
  if (profile === null) {
    return (
      <div className="space-y-6">
        <BackLink onClick={() => router.push("/areas-of-service/admin/verification")} />
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
  // Both compared against the FROZEN baseline, not the live row: once the
  // owner edits, `toFormState(profile)` is their new text, so comparing
  // against it would report the reviewer as having typed changes they never
  // made, and would send those stale values as `edits`.
  const dirty =
    baselineRef.current !== null &&
    JSON.stringify(form) !== JSON.stringify(baselineRef.current);
  // The version this reviewer started from. Both reviewer mutations carry it
  // so the server can refuse an action built on text the owner has since
  // changed.
  const seenUpdatedAt = seenRef.current ?? profile.updatedAt;
  const trimmedReason = reason.trim();
  const reasonTooShort = trimmedReason.length < SENT_BACK_REASON_MIN_LENGTH;
  const reasonTooLong = trimmedReason.length > SENT_BACK_REASON_MAX_LENGTH;

  function set<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleFailure(err: unknown) {
    const code = profileLifecycleErrorCode(err);
    if (code) {
      // A rule the server applied on purpose: show its sentence, and do not
      // report it to Sentry as a fault.
      setRefusal(
        profileLifecycleErrorMessage(
          err,
          profileStaleCause(profile?.sentBackAt, seenUpdatedAt),
        ),
      );
      return;
    }
    // A rejected mutation in an event handler never reaches a React error
    // boundary — reported directly from the catch that already exists here.
    Sentry.captureException(err);
    setError(true);
  }

  async function handleVerify() {
    if (!form) return;
    setBusy(true);
    setError(false);
    setRefusal(null);
    try {
      await verifyProfile({
        profileId: id,
        // The `updatedAt` this screen actually rendered, never a fresh read:
        // a fresh read would always match and the guard would be decoration.
        seenUpdatedAt,
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
      router.push("/areas-of-service/admin/verification");
    } catch (err) {
      setConfirmOpen(false);
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendBack() {
    setBusy(true);
    setError(false);
    setRefusal(null);
    try {
      await sendProfileBack({ profileId: id, reason, seenUpdatedAt });
      setSendBackOpen(false);
      setReason("");
      router.push("/areas-of-service/admin/verification");
    } catch (err) {
      setSendBackOpen(false);
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <BackLink onClick={() => router.push("/areas-of-service/admin/verification")} />

      <header className="flex flex-wrap items-center gap-3">
        <Avatar name={fullName(profile)} src={profile.photoUrl} size="lg" />
        <Heading as="h1" size="2xl">
          {fullName(profile)}
        </Heading>
        {profile.isResubmission && (
          <Badge variant="neutral">
            <Undo2 className="mr-1 size-3" aria-hidden="true" />
            Resubmitted
          </Badge>
        )}
        {needsFollowUp && (
          <Badge variant="pending">
            <PhoneCall className="mr-1 size-3" aria-hidden="true" />
            Needs follow-up call — no mentorship certificate
          </Badge>
        )}
      </header>

      {/* What was asked for last time, above the fields, so a reviewer sees it
          before deciding again (AC-5). The reason survives resubmission on
          purpose, which is what makes this possible at all. */}
      {profile.sentBackReason && (
        <Card className="gap-2 border-primary/40 bg-primary-light p-5">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-sm font-semibold text-primary">
              {profile.isResubmission
                ? "What you asked for last time"
                : "Sent back and waiting on its owner"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-0">
            <p className="font-body text-base text-on-surface">
              {profile.sentBackReason}
            </p>
            <p className="font-body text-xs text-on-surface-variant">
              {profile.sentBackByName ?? "A reviewer"}
              {profile.sentBackAt
                ? ` · ${new Date(profile.sentBackAt).toLocaleDateString()}`
                : ""}
            </p>
          </CardContent>
        </Card>
      )}

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
            {ownerMovedIt && !refusal && (
              <CardContent className="p-0">
                <p
                  role="status"
                  className="rounded-md bg-royal-light p-3 font-body text-sm text-on-surface"
                >
                  This person has edited their profile since you opened it. The
                  details on the left are their latest; anything you have typed
                  on the right is still yours. Reload before saving if you want
                  to start from their new version.
                </p>
              </CardContent>
            )}
            {refusal && (
              <CardContent className="p-0">
                <p
                  role="status"
                  className="rounded-md bg-warning-light p-3 font-body text-sm text-on-surface"
                >
                  {refusal}
                </p>
              </CardContent>
            )}
            {error && (
              <CardContent className="p-0">
                <ErrorState cause="generic" retry={handleVerify} />
              </CardContent>
            )}
            <CardFooter className="flex-col gap-2 p-0">
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
              >
                Verify &amp; Approve
              </Button>
              {/* The other half of the review conversation (F2-05): refuse
                  honestly, in writing, instead of correcting it silently or
                  verifying something you do not believe. */}
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => setSendBackOpen(true)}
              >
                <Undo2 aria-hidden="true" />
                Send back for changes
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

      {/* Send back: the reason is required and the confirm stays disabled
          until the shared minimum is met, so the person on the other end
          never receives a one-word note they cannot act on. */}
      <Dialog
        open={sendBackOpen}
        onOpenChange={(next) => {
          if (!next && !busy) setSendBackOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send this profile back?</DialogTitle>
            <DialogDescription>
              {fullName(profile)} will be told what to change and can edit and
              resubmit. They read your words as given, signed {REVIEWER_NAME} —
              your own name is never shown to them.
            </DialogDescription>
          </DialogHeader>
          <Field label="What needs to change?" htmlFor="send-back-reason">
            <Textarea
              id="send-back-reason"
              rows={4}
              value={reason}
              placeholder="Your photo is hard to make out — please upload a clearer one."
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <p
            className={
              reasonTooLong
                ? "font-mono text-xs text-error"
                : "font-mono text-xs text-on-surface-variant"
            }
          >
            {trimmedReason.length} / {SENT_BACK_REASON_MAX_LENGTH}
            {reasonTooShort
              ? ` · at least ${SENT_BACK_REASON_MIN_LENGTH} characters`
              : ""}
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSendBackOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={reasonTooShort || reasonTooLong}
              onClick={handleSendBack}
            >
              Send it back
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