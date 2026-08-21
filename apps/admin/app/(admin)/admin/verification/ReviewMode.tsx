"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Avatar } from "@/components/shadcn/avatar";
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
import { EmptyState } from "@/components/ui/EmptyState";
import {
  capitalize,
  errorMessage,
  formatAddress,
  formatDateOfBirth,
  toFormState,
  type EditableFields,
} from "./shared";

// No "send back" action here by design — convex/schema.ts documents that
// memberProfiles has no rejected/sent-back status; admins correct fields in
// place and approve, same as the detail page. Review mode is Approve / Skip.
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
  const clans = useAuthQuery(api.clans.listClans);
  const verifyProfile = useMutation(api.memberProfiles.verifyProfile);

  const clanNameById = useMemo(() => {
    const map = new Map<Id<"clans">, string>();
    clans?.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [clans]);

  const [form, setForm] = useState<EditableFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setForm(toFormState(profile));
  }, [profile]);

  useEffect(() => {
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
    setError(null);
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
    setError(null);
    const dirty = JSON.stringify(form) !== JSON.stringify(toFormState(profile));
    try {
      await verifyProfile({
        profileId: currentId,
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const dob = profile ? formatDateOfBirth(profile.dateOfBirth) : null;
  const address = profile ? formatAddress(profile.address) : null;
  const clanName =
    profile?.clanId ? clanNameById.get(profile.clanId) ?? null : null;
  const spouseLabel = profile
    ? profile.spouseNameUnlinked
      ? profile.spouseNameUnlinked
      : profile.spouseUserId
        ? "Linked member profile"
        : null
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-center font-body text-sm text-on-surface-variant">
        Review mode — one at a time
      </p>

      <Card className="gap-5 p-6">
        {profile == null || form === null ? (
          <CardContent className="flex flex-col items-center gap-4 p-0">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </CardContent>
        ) : (
          <>
            <CardHeader className="flex flex-col items-center gap-2 p-0 text-center">
              <Avatar
                name={`${profile.firstName} ${profile.lastName}`}
                src={profile.photoUrl}
                size="md"
              />
              <CardTitle className="font-body text-lg font-semibold text-on-surface">
                {profile.firstName} {profile.lastName}
              </CardTitle>
              <p className="font-mono text-xs text-on-surface-variant">
                {index + 1} of {total}
              </p>
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
                <Field label="Mentorship" htmlFor="rm-mentorship">
                  <p
                    id="rm-mentorship"
                    className="pt-2 font-body text-sm text-on-surface-variant"
                  >
                    {capitalize(profile.mentorshipStatus.replace("_", " "))}
                  </p>
                </Field>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <Field label="Occupation" htmlFor="rm-occupation">
                  <Input
                    id="rm-occupation"
                    value={form.occupation}
                    onChange={(e) => set("occupation", e.target.value)}
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

              <Separator />

              {/* Read-only submitted context — not part of the edit form,
                  shown so a reviewer sees the full submission before
                  deciding, per the Verification Queue spec. */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-body text-sm">
                <ReadOnlyField label="Date of birth" value={dob} />
                <ReadOnlyField label="Clan" value={clanName} />
                <ReadOnlyField label="Address" value={address} span2 />
                <ReadOnlyField label="Spouse" value={spouseLabel} />
                <ReadOnlyField
                  label="Anniversary"
                  value={
                    profile.anniversaryDate
                      ? new Date(profile.anniversaryDate).toLocaleDateString()
                      : null
                  }
                />
                <ReadOnlyField
                  label="Next of kin"
                  value={
                    profile.nextOfKin
                      ? `${profile.nextOfKin.fullName} — ${profile.nextOfKin.relationship} (${profile.nextOfKin.phone})`
                      : null
                  }
                  span2
                />
              </div>

              {error && (
                <p className="font-body text-sm text-error">{error}</p>
              )}
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
          </>
        )}
      </Card>

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

function ReadOnlyField({
  label,
  value,
  span2,
}: {
  label: string;
  value: string | null;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : undefined}>
      <p className="font-body text-xs uppercase tracking-wide text-outline">
        {label}
      </p>
      <p className="mt-0.5 text-on-surface-variant">{value ?? "—"}</p>
    </div>
  );
}
