"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { PhoneCall } from "lucide-react";
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
import { EmptyState } from "@/components/ui/EmptyState";
import {
  capitalize,
  errorMessage,
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
  const verifyProfile = useMutation(api.memberProfiles.verifyProfile);

  const [form, setForm] = useState<EditableFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setForm(toFormState(profile));
  }, [profile]);

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
                size="md"
              />
              <CardTitle className="font-body text-lg font-semibold text-on-surface">
                {profile.firstName} {profile.lastName}
              </CardTitle>
              <p className="font-mono text-xs text-on-surface-variant">
                {index + 1} of {total}
              </p>
              {!profile.mentorshipProofUrl && (
                <Badge variant="pending">
                  <PhoneCall className="mr-1 size-3" aria-hidden="true" />
                  Needs follow-up call
                </Badge>
              )}
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

              {error && <p className="font-body text-sm text-error">{error}</p>}
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
