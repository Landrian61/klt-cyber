"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { DEPARTMENT_DESCRIPTION_MAX_LENGTH } from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { Heading } from "@/components/ui/Heading";
import { ActionButton } from "@/components/ui/ActionButton";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { AccountPanel } from "@/components/account/AccountPanel";
import type { DepartmentShellContext } from "./DepartmentShellProvider";

/**
 * A department's Settings page (spec 0012, AC-8, AC-9).
 *
 * Three sections. The description editor and the contact number both render
 * only for this department's head, and the server rejects anyone else
 * regardless. Below them, the caller's own account, through the same panel
 * every other Settings page in the portal uses — a person's account is not
 * department scoped, so this page surfaces the one place it lives rather than
 * growing a copy.
 *
 * The contact number (spec 0015, AC-29) is the one number the whole
 * congregation taps: it is what the Library's WhatsApp and call buttons are
 * built from on the member's screen, and Real Estate's letting enquiries use
 * the same field. A roster member sees neither editor, only their own account
 * panel (AC-4).
 */
export function DepartmentSettings({
  departmentId,
  departmentName,
  description,
  contactPhone,
  can,
}: {
  departmentId: Id<"departments">;
  departmentName: string;
  description: string | null;
  contactPhone: string | null;
  can: DepartmentShellContext["can"];
}) {
  const updateDescription = useMutation(
    api.departmentShell.updateDepartmentDescription,
  );
  const updateContactPhone = useMutation(api.departmentShell.updateContactPhone);

  const [draft, setDraft] = useState(description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [phoneDraft, setPhoneDraft] = useState(contactPhone ?? "");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null);

  async function handleSavePhone() {
    setPhoneBusy(true);
    setPhoneError(null);
    setPhoneStatus(null);
    try {
      const result = await updateContactPhone({
        departmentId,
        contactPhone: phoneDraft,
      });
      setPhoneStatus(
        result.changed
          ? phoneDraft.trim()
            ? "Saved."
            : "Cleared. The contact buttons are gone from the app."
          : "Nothing had changed.",
      );
    } catch (mutationError) {
      setPhoneError(errorMessage(mutationError));
    } finally {
      setPhoneBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await updateDescription({ departmentId, description: draft });
      // An unchanged save writes no audit entry, and says so rather than
      // claiming a change nobody made.
      setStatus(result.changed ? "Saved." : "Nothing had changed.");
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  const remaining = DEPARTMENT_DESCRIPTION_MAX_LENGTH - draft.length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="xl">
          Settings
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          {can.editDescription
            ? `What ${departmentName} says about itself, and your own details.`
            : "Your own contact and professional details."}
        </p>
      </header>

      {can.editDescription && (
        <Card className="gap-5 p-6">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-lg font-semibold text-on-surface">
              About {departmentName}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <Field
              label="Description"
              htmlFor="department-description"
              hint={`One or two lines, shown on this department's card on the Areas of Service page. ${remaining} characters left. Leave it empty to show no description.`}
            >
              <Textarea
                id="department-description"
                rows={3}
                value={draft}
                maxLength={DEPARTMENT_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setStatus(null);
                }}
                placeholder={`e.g. What ${departmentName} does, in a sentence.`}
              />
            </Field>
          </CardContent>

          <CardFooter className="gap-3 p-0">
            <ActionButton variant="gold" loading={busy} onClick={handleSave}>
              Save description
            </ActionButton>
            {status && (
              <span className="font-body text-sm text-success">{status}</span>
            )}
            {error && (
              <span role="alert" className="font-body text-sm text-error">
                {error}
              </span>
            )}
          </CardFooter>
        </Card>
      )}

      {can.editDescription && (
        <Card className="gap-5 p-6">
          <CardHeader className="p-0">
            <CardTitle className="font-body text-lg font-semibold text-on-surface">
              How members reach {departmentName}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <Field
              label="Contact number"
              htmlFor="department-contact-phone"
              hint="In full international form, starting with the country code, e.g. +256700123456. This is the number the WhatsApp and call buttons in the app are built from. Leave it empty and no buttons show at all."
            >
              <Input
                id="department-contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phoneDraft}
                onChange={(event) => {
                  setPhoneDraft(event.target.value);
                  setPhoneStatus(null);
                }}
                placeholder="+256700123456"
              />
            </Field>
          </CardContent>

          <CardFooter className="gap-3 p-0">
            <ActionButton
              variant="gold"
              loading={phoneBusy}
              onClick={handleSavePhone}
            >
              Save number
            </ActionButton>
            {phoneStatus && (
              <span className="font-body text-sm text-success">
                {phoneStatus}
              </span>
            )}
            {phoneError && (
              <span role="alert" className="font-body text-sm text-error">
                {phoneError}
              </span>
            )}
          </CardFooter>
        </Card>
      )}

      <AccountPanel />
    </div>
  );
}
