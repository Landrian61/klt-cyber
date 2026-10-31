"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/content-helpers";
import {
  CLAN_UNASSIGNED_COPY,
  MENTORSHIP_STATUS_LABEL,
  profileLifecycleErrorCode,
  profileLifecycleErrorMessage,
} from "@klt-cyber/shared";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Switch } from "@/components/shadcn/switch";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { MyAreasOfServicePanel } from "./MyAreasOfServicePanel";

/**
 * The caller's own account and member details.
 *
 * Extracted from the Administration settings page when the shared department
 * shell needed the same thing (spec 0012, AC-9): a person's account is not
 * department scoped, so every Settings page in the portal surfaces this one
 * panel rather than growing its own editor. Administration's page and every
 * department's page now render the same component, so there is one place where
 * "edit my details" lives.
 *
 * It edits the SAME field set as the mobile app, through the same
 * `profile.updateMyProfile` (spec 0014, AC-12). It used to offer eight fields
 * out of about thirty, which is the gap F2-09 recorded. A field added to that
 * mutation later appears on both surfaces or neither — the two cannot drift.
 *
 * Three fields are deliberately NOT here. `clanId` has one writer,
 * `changeMyClan`, so its elder notices can never be skipped; the photo belongs
 * to the mobile upload flow; and mentorship cannot cross the `completed` line
 * from either side, which the server enforces and this panel explains.
 */

const ROLE_LABELS: Record<string, string> = {
  system_admin: "System Admin",
  clan_elder: "Clan Elder",
  hod: "Department Head",
  department_admin: "Department Admin",
};

/**
 * The fields `profile.updateMyProfile` will unset, mirroring its own literal
 * union. Only genuinely optional fields are on it: `firstName`, `sex`,
 * `maritalStatus` and `mentorshipStatus` are required on the row, so they
 * cannot be cleared from either surface.
 */
type ClearableField =
  | "middleName"
  | "phone"
  | "shortBio"
  | "occupation"
  | "industry"
  | "employer"
  | "skills"
  | "address"
  | "nextOfKin";

type Sex = "male" | "female";
type MaritalStatus = "single" | "married" | "widowed" | "divorced";
type Mentorship = "not_enrolled" | "enrolled" | "completed";

type EditableFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  sex: Sex;
  maritalStatus: MaritalStatus;
  shortBio: string;
  occupation: string;
  industry: string;
  employer: string;
  skills: string;
  addressLine1: string;
  addressCity: string;
  addressDistrict: string;
  addressCountry: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  mentorshipStatus: Mentorship;
};

function emptyForm(): EditableFields {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    phone: "",
    sex: "male",
    maritalStatus: "single",
    shortBio: "",
    occupation: "",
    industry: "",
    employer: "",
    skills: "",
    addressLine1: "",
    addressCity: "",
    addressDistrict: "",
    addressCountry: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
    mentorshipStatus: "not_enrolled",
  };
}

export function AccountPanel() {
  const account = useAuthQuery(api.profile.getMyAccount);
  const updateMyProfile = useMutation(api.profile.updateMyProfile);

  const setDirectorySharing = useMutation(api.profile.setDirectorySharing);
  const clans = useAuthQuery(api.clans.listClans);

  const [form, setForm] = useState<EditableFields>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);

  const clanName = account?.profile?.clanId
    ? (clans?.find((clan) => clan._id === account.profile?.clanId)?.name ?? null)
    : null;

  useEffect(() => {
    const profile = account?.profile;
    if (!profile) return;
    setForm({
      firstName: profile.firstName ?? "",
      middleName: profile.middleName ?? "",
      lastName: profile.lastName ?? "",
      phone: profile.phone ?? "",
      sex: profile.sex,
      maritalStatus: profile.maritalStatus,
      shortBio: profile.shortBio ?? "",
      occupation: profile.occupation ?? "",
      industry: profile.industry ?? "",
      employer: profile.employer ?? "",
      // Comma separated in the form, an array on the wire. One text field is
      // the right weight for a handful of words; a tag editor is not.
      skills: (profile.skills ?? []).join(", "),
      addressLine1: profile.address?.line1 ?? "",
      addressCity: profile.address?.city ?? "",
      addressDistrict: profile.address?.district ?? "",
      addressCountry: profile.address?.country ?? "",
      nextOfKinName: profile.nextOfKin?.fullName ?? "",
      nextOfKinRelationship: profile.nextOfKin?.relationship ?? "",
      nextOfKinPhone: profile.nextOfKin?.phone ?? "",
      mentorshipStatus: profile.mentorshipStatus,
    });
  }, [account]);

  function set<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  /**
   * Fields the person has emptied, named explicitly.
   *
   * An omitted value means "unchanged" to the mutation, which is what makes a
   * partial save possible — but it leaves no way to REMOVE a phone number or
   * an address. `clearFields` is that way, so clearing a box here actually
   * clears the field rather than silently doing nothing.
   */
  function clearedFields(): ClearableField[] {
    const cleared: ClearableField[] = [];
    if (!form.middleName) cleared.push("middleName");
    if (!form.phone) cleared.push("phone");
    if (!form.shortBio) cleared.push("shortBio");
    if (!form.occupation) cleared.push("occupation");
    if (!form.industry) cleared.push("industry");
    if (!form.employer) cleared.push("employer");
    if (!form.skills.trim()) cleared.push("skills");
    if (!form.addressLine1.trim()) cleared.push("address");
    if (!form.nextOfKinName.trim()) cleared.push("nextOfKin");
    return cleared;
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const cleared = clearedFields();
      await updateMyProfile({
        firstName: form.firstName || undefined,
        middleName: form.middleName || undefined,
        lastName: form.lastName || undefined,
        phone: form.phone || undefined,
        sex: form.sex,
        maritalStatus: form.maritalStatus,
        shortBio: form.shortBio || undefined,
        occupation: form.occupation || undefined,
        industry: form.industry || undefined,
        employer: form.employer || undefined,
        skills: form.skills.trim()
          ? form.skills
              .split(",")
              .map((skill) => skill.trim())
              .filter(Boolean)
          : undefined,
        // `line1` is the essential locator, so the whole object only goes when
        // it is filled — the same rule the mobile wizard applies.
        address: form.addressLine1.trim()
          ? {
              line1: form.addressLine1.trim(),
              city: form.addressCity.trim() || undefined,
              district: form.addressDistrict.trim() || undefined,
              country: form.addressCountry.trim() || undefined,
            }
          : undefined,
        // Next of kin is all three fields or none: a name with no way to reach
        // them is not a next of kin.
        nextOfKin:
          form.nextOfKinName.trim() &&
          form.nextOfKinRelationship.trim() &&
          form.nextOfKinPhone.trim()
            ? {
                fullName: form.nextOfKinName.trim(),
                relationship: form.nextOfKinRelationship.trim(),
                phone: form.nextOfKinPhone.trim(),
              }
            : undefined,
        mentorshipStatus: form.mentorshipStatus,
        ...(cleared.length > 0 ? { clearFields: cleared } : {}),
      });
      setSaved(true);
    } catch (err) {
      // A coded refusal gets the shared sentence, which is the same one the
      // mobile app shows for the same rule.
      setError(
        profileLifecycleErrorCode(err)
          ? profileLifecycleErrorMessage(err)
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSharingChange(next: boolean) {
    setSharingBusy(true);
    setError(null);
    try {
      await setDirectorySharing({ directorySharing: next });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSharingBusy(false);
    }
  }

  if (account === undefined) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading your account">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-96 w-full rounded-md" />
      </div>
    );
  }

  if (account === null) {
    return (
      <EmptyState
        title="You're signed out"
        message="You need to be signed in to view your account."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="font-body text-lg font-semibold text-on-surface">
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-outline">
                Email
              </dt>
              <dd className="mt-1 font-body text-sm text-on-surface">
                {account.user.email}
              </dd>
            </div>
            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-outline">
                Admin roles
              </dt>
              <dd className="mt-1 font-body text-sm text-on-surface">
                {account.activeRoles.length === 0 ? (
                  <span className="text-outline">&mdash;</span>
                ) : (
                  account.activeRoles
                    .map((r) => ROLE_LABELS[r.roleType] ?? r.roleType)
                    .join(", ")
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {account.profile === null ? (
        <Card className="p-6">
          <CardContent className="p-0">
            <p className="font-body text-sm text-on-surface-variant">
              You haven&apos;t submitted a member profile through the mobile app
              yet, so there&apos;s nothing here to edit. This doesn&apos;t affect
              your portal access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-5 p-6">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-lg font-semibold text-on-surface">
              Your Details
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name" htmlFor="settings-first-name">
                <Input
                  id="settings-first-name"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label="Middle name" htmlFor="settings-middle-name">
                <Input
                  id="settings-middle-name"
                  value={form.middleName}
                  onChange={(e) => set("middleName", e.target.value)}
                />
              </Field>
              <Field label="Last name" htmlFor="settings-last-name">
                <Input
                  id="settings-last-name"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="settings-phone">
                <Input
                  id="settings-phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="Occupation" htmlFor="settings-occupation">
                <Input
                  id="settings-occupation"
                  value={form.occupation}
                  onChange={(e) => set("occupation", e.target.value)}
                />
              </Field>
              <Field label="Industry" htmlFor="settings-industry">
                <Input
                  id="settings-industry"
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                />
              </Field>
              <Field label="Employer" htmlFor="settings-employer">
                <Input
                  id="settings-employer"
                  value={form.employer}
                  onChange={(e) => set("employer", e.target.value)}
                />
              </Field>
              <Field label="Sex" htmlFor="settings-sex">
                <Select
                  value={form.sex}
                  onValueChange={(v) => set("sex", v as Sex)}
                >
                  <SelectTrigger id="settings-sex">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Marital status" htmlFor="settings-marital">
                <Select
                  value={form.maritalStatus}
                  onValueChange={(v) => set("maritalStatus", v as MaritalStatus)}
                >
                  <SelectTrigger id="settings-marital">
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
              <Field
                label="Skills"
                htmlFor="settings-skills"
                hint="Separate them with commas."
                className="sm:col-span-2"
              >
                <Input
                  id="settings-skills"
                  value={form.skills}
                  onChange={(e) => set("skills", e.target.value)}
                />
              </Field>
              <Field
                label="Short bio"
                htmlFor="settings-short-bio"
                className="sm:col-span-2"
              >
                <Textarea
                  id="settings-short-bio"
                  rows={3}
                  value={form.shortBio}
                  onChange={(e) => set("shortBio", e.target.value)}
                />
              </Field>
            </div>

            <Separator className="my-6" />

            <h3 className="mb-4 font-body text-sm font-semibold text-on-surface">
              Address
            </h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Village, zone, plot and street"
                htmlFor="settings-address-line1"
                hint="Clear this to remove your address entirely."
                className="sm:col-span-2"
              >
                <Input
                  id="settings-address-line1"
                  value={form.addressLine1}
                  onChange={(e) => set("addressLine1", e.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="settings-address-city">
                <Input
                  id="settings-address-city"
                  value={form.addressCity}
                  onChange={(e) => set("addressCity", e.target.value)}
                />
              </Field>
              <Field label="District" htmlFor="settings-address-district">
                <Input
                  id="settings-address-district"
                  value={form.addressDistrict}
                  onChange={(e) => set("addressDistrict", e.target.value)}
                />
              </Field>
              <Field label="Country" htmlFor="settings-address-country">
                <Input
                  id="settings-address-country"
                  value={form.addressCountry}
                  onChange={(e) => set("addressCountry", e.target.value)}
                />
              </Field>
            </div>

            <Separator className="my-6" />

            <h3 className="mb-4 font-body text-sm font-semibold text-on-surface">
              Next of kin
            </h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Full name"
                htmlFor="settings-nok-name"
                hint="All three are needed, or none are saved."
              >
                <Input
                  id="settings-nok-name"
                  value={form.nextOfKinName}
                  onChange={(e) => set("nextOfKinName", e.target.value)}
                />
              </Field>
              <Field label="Relationship" htmlFor="settings-nok-relationship">
                <Input
                  id="settings-nok-relationship"
                  value={form.nextOfKinRelationship}
                  onChange={(e) =>
                    set("nextOfKinRelationship", e.target.value)
                  }
                />
              </Field>
              <Field label="Phone" htmlFor="settings-nok-phone">
                <Input
                  id="settings-nok-phone"
                  value={form.nextOfKinPhone}
                  onChange={(e) => set("nextOfKinPhone", e.target.value)}
                />
              </Field>
            </div>

            <Separator className="my-6" />

            <h3 className="mb-4 font-body text-sm font-semibold text-on-surface">
              Church
            </h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Mentorship"
                htmlFor="settings-mentorship"
                hint="The Administration team confirms when mentorship is complete, so that step is not yours to set."
              >
                <Select
                  value={form.mentorshipStatus}
                  onValueChange={(v) =>
                    set("mentorshipStatus", v as Mentorship)
                  }
                >
                  <SelectTrigger id="settings-mentorship">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_enrolled">
                      {MENTORSHIP_STATUS_LABEL.not_enrolled}
                    </SelectItem>
                    <SelectItem value="enrolled">
                      {MENTORSHIP_STATUS_LABEL.enrolled}
                    </SelectItem>
                    {/* Offered only to somebody already confirmed, so the form
                        never asks for something the server will refuse. */}
                    {account.profile.mentorshipStatus === "completed" && (
                      <SelectItem value="completed">
                        {MENTORSHIP_STATUS_LABEL.completed}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <div>
                <p className="font-body text-xs uppercase tracking-wide text-outline">
                  Clan
                </p>
                {/* Read only here: `changeMyClan` is the one writer of
                    `clanId`, so its elder notices cannot be skipped by
                    routing a clan change through a general field save. */}
                <p className="mt-1 font-body text-sm text-on-surface">
                  {account.profile.clanId
                    ? (clanName ?? "Your clan")
                    : CLAN_UNASSIGNED_COPY}
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="gap-3 p-0">
            <Button size="sm" loading={busy} onClick={handleSave}>
              Save changes
            </Button>
            {saved && (
              <span className="font-body text-sm text-success">Saved.</span>
            )}
            {error && (
              <span className="font-body text-sm text-error">{error}</span>
            )}
          </CardFooter>
        </Card>
      )}

      {/* Areas of Service and clan: the member's own, with their own actions
          (spec 0014, AC-19 to AC-22). Kept as its own component because the
          clan has exactly one writer and these are mutations in their own
          right, not fields on the form above. */}
      <MyAreasOfServicePanel />

      {/* Sharing is its own card and saves on the switch, not on Save
          changes: it is a disclosure decision rather than a form field, and
          somebody turning it off should not have to find a button to make
          that take effect (spec 0014, AC-17). */}
      {account.profile !== null && (
        <Card className="gap-4 p-6">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-lg font-semibold text-on-surface">
              Member Directory
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-6 p-0">
            <div className="space-y-1">
              <p className="font-body text-sm text-on-surface">
                Let other members find me
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                Your name, photo and areas of service appear in the church
                directory. Your phone number, address and family details never
                do. Off unless you turn it on.
              </p>
            </div>
            <Switch
              checked={account.profile.directorySharing === true}
              disabled={sharingBusy}
              onCheckedChange={handleSharingChange}
              aria-label="Let other members find me in the directory"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
