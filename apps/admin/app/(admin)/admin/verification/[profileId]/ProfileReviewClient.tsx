"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { PhoneCall, ArrowLeft } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Card, Badge, Button, Input, Select, Dialog } from "../../ui";
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

  if (profile === undefined || form === null) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-xl bg-muted lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <p className="text-sm text-muted-foreground">
        This profile no longer exists or has already been reviewed.
      </p>
    );
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/verification")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-display text-2xl font-semibold">
          {profile.firstName} {profile.lastName}
        </h2>
        {needsFollowUp && (
          <Badge variant="destructive" className="gap-1">
            <PhoneCall className="h-3 w-3" />
            Needs follow-up call — no mentorship certificate
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: read-only context */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
              Submission Details
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Mentorship status">
                {capitalize(profile.mentorshipStatus.replace("_", " "))}
              </Field>
              <Field label="Certificate">
                {profile.mentorshipProofUrl ? (
                  <a
                    href={profile.mentorshipProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-primary)] underline underline-offset-2"
                  >
                    View certificate
                  </a>
                ) : (
                  "Not submitted"
                )}
              </Field>
              <Field label="Submitted">
                {new Date(profile._creationTime).toLocaleString()}
              </Field>
              <Field label="Join date">
                {profile.joinDate
                  ? new Date(profile.joinDate).toLocaleDateString()
                  : "—"}
              </Field>
            </dl>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
              Family
            </h3>
            {profile.children.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No children on this profile.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {profile.children.map((child, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{child.name}</span>
                    <span className="text-muted-foreground capitalize">
                      {child.sex}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {profile.leadershipProgress.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
                Leadership Progress
              </h3>
              <ul className="flex flex-col gap-2">
                {profile.leadershipProgress.map((entry, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize">
                      {entry.level.replace("_", " ")}
                    </span>
                    <Badge variant="secondary" className="capitalize">
                      {entry.status.replace("_", " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Right: editable fields + verify action */}
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
              Edit Before Approving
            </h3>
            <div className="flex flex-col gap-4">
              <LabeledInput
                label="First name"
                value={form.firstName}
                onChange={(v) => set("firstName", v)}
              />
              <LabeledInput
                label="Middle name"
                value={form.middleName}
                onChange={(v) => set("middleName", v)}
              />
              <LabeledInput
                label="Last name"
                value={form.lastName}
                onChange={(v) => set("lastName", v)}
              />
              <LabeledInput
                label="Phone"
                value={form.phone}
                onChange={(v) => set("phone", v)}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Sex
                </label>
                <Select
                  value={form.sex}
                  onValueChange={(v) => set("sex", v as EditableFields["sex"])}
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Marital status
                </label>
                <Select
                  value={form.maritalStatus}
                  onValueChange={(v) =>
                    set("maritalStatus", v as EditableFields["maritalStatus"])
                  }
                  options={[
                    { value: "single", label: "Single" },
                    { value: "married", label: "Married" },
                    { value: "widowed", label: "Widowed" },
                    { value: "divorced", label: "Divorced" },
                  ]}
                />
              </div>

              <div className="h-px bg-border" />

              <LabeledInput
                label="Occupation"
                value={form.occupation}
                onChange={(v) => set("occupation", v)}
              />
              <LabeledInput
                label="Industry"
                value={form.industry}
                onChange={(v) => set("industry", v)}
              />
              <LabeledInput
                label="Employer"
                value={form.employer}
                onChange={(v) => set("employer", v)}
              />
            </div>
          </Card>

          <Card className="p-6">
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              Verify &amp; Approve
            </Button>

            <Dialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Approve this profile?"
              description={
                <>
                  {form.firstName} {form.lastName} will be promoted from visitor
                  to member.
                  {dirty &&
                    " Your edits will be saved along with the approval."}
                  {needsFollowUp &&
                    " No mentorship certificate is on file — confirm the manual follow-up call happened before approving."}
                </>
              }
              footer={
                <>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmOpen(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleVerify} disabled={busy}>
                    {busy ? "Approving…" : "Confirm approval"}
                  </Button>
                </>
              }
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
