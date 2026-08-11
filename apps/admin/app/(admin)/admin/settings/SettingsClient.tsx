"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Card, Button, Input } from "../ui";
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
      <div className="flex flex-col gap-6">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (account === null) {
    return (
      <p className="text-sm text-muted-foreground">
        You need to be signed in to view settings.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your own contact and professional details.
        </p>
      </div>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
          Account
        </h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd>{account.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Admin roles</dt>
            <dd>
              {account.activeRoles.length === 0
                ? "—"
                : account.activeRoles
                    .map((r) => ROLE_LABELS[r.roleType] ?? r.roleType)
                    .join(", ")}
            </dd>
          </div>
        </dl>
      </Card>

      {account.profile === null ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            You haven&apos;t submitted a member profile through the mobile app
            yet, so there&apos;s nothing here to edit. This doesn&apos;t affect
            your Administration access.
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
            Your Details
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="sm:col-span-2">
              <LabeledInput
                label="Short bio"
                value={form.shortBio}
                onChange={(v) => set("shortBio", v)}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            {saved && (
              <span className="text-sm text-muted-foreground">Saved.</span>
            )}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </Card>
      )}
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

