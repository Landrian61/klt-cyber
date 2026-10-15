"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
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
import { Skeleton } from "@/components/shadcn/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { errorMessage } from "../verification/shared";

const ROLE_LABELS: Record<string, string> = {
  system_admin: "System Admin",
  clan_elder: "Clan Elder",
  hod: "Department Head",
  department_admin: "Department Admin",
};

type EditableFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  shortBio: string;
  occupation: string;
  industry: string;
  employer: string;
};

function emptyForm(): EditableFields {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    phone: "",
    shortBio: "",
    occupation: "",
    industry: "",
    employer: "",
  };
}

export function SettingsClient() {
  const account = useAuthQuery(api.profile.getMyAccount);
  const updateMyProfile = useMutation(api.profile.updateMyProfile);

  const [form, setForm] = useState<EditableFields>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (account?.profile) {
      setForm({
        firstName: account.profile.firstName ?? "",
        middleName: account.profile.middleName ?? "",
        lastName: account.profile.lastName ?? "",
        phone: account.profile.phone ?? "",
        shortBio: account.profile.shortBio ?? "",
        occupation: account.profile.occupation ?? "",
        industry: account.profile.industry ?? "",
        employer: account.profile.employer ?? "",
      });
    }
  }, [account]);

  function set<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateMyProfile({
        firstName: form.firstName || undefined,
        middleName: form.middleName || undefined,
        lastName: form.lastName || undefined,
        phone: form.phone || undefined,
        shortBio: form.shortBio || undefined,
        occupation: form.occupation || undefined,
        industry: form.industry || undefined,
        employer: form.employer || undefined,
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (account === undefined) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-96 w-full rounded-md" />
      </div>
    );
  }

  if (account === null) {
    return (
      <EmptyState
        title="You're signed out"
        message="You need to be signed in to view settings."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="2xl">
          Settings
        </Heading>
        <p className="font-body text-base text-on-surface-variant">
          Manage your own contact and professional details.
        </p>
      </header>

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
              your Administration access.
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
    </div>
  );
}
