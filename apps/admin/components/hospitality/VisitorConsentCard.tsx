"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { HOSPITALITY_NOTE_MAX } from "@klt-cyber/shared";

import { api } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { formatMoment, hospitalityError } from "./hospitalityErrors";
import type { VisitorRecordData } from "./VisitorRecordPage";

/**
 * Phone and consent (spec 0024, AC-22 to AC-24).
 *
 * The only place a phone is set or changed. Three cases, the same three the
 * server enforces:
 * - consent live: change the number, no note;
 * - never consented: tick the box, no note;
 * - consented before and withdrew: tick the box AND say why.
 * Withdrawing clears the phone, which hides every contact button.
 */
export function VisitorConsentCard({
  record,
  readOnly,
}: {
  record: VisitorRecordData;
  readOnly: boolean;
}) {
  const setConsent = useMutation(api.hospitality.setConsent);
  const withdrawConsent = useMutation(api.hospitality.withdrawConsent);

  const consent = record.consent;
  const live = consent?.live === true;
  const givenBefore = consent !== null && !live;

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [ticked, setTicked] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  function open() {
    setPhone("");
    setTicked(false);
    setNote("");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!phone.trim()) {
      setError("Enter the phone number.");
      return;
    }
    if (!live && !ticked) {
      setError("Tick the consent box to keep this phone number.");
      return;
    }
    if (givenBefore && !note.trim()) {
      setError("Add a short note saying why consent is given again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setConsent({
        visitorId: record._id,
        phone,
        ...(live ? {} : { consent: true }),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setEditing(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await withdrawConsent({ visitorId: record._id });
      setConfirmWithdraw(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface-lowest p-5 shadow-e1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Heading as="h2" size="lg">
          Phone and consent
        </Heading>
        {live ? (
          <Badge variant="verified">Consent given</Badge>
        ) : givenBefore ? (
          <Badge variant="rejected">Consent withdrawn</Badge>
        ) : (
          <Badge variant="neutral">No phone kept</Badge>
        )}
      </div>

      {live && record.phone && (
        <p className="font-mono text-base text-on-surface">{record.phone}</p>
      )}
      {consent && (
        <ul className="mt-2 space-y-1 font-body text-xs text-on-surface-variant">
          <li>
            Given {formatMoment(consent.givenAt)} by {consent.givenByName}
            {consent.note ? `: “${consent.note}”` : ""}
          </li>
          {consent.withdrawnAt !== undefined && (
            <li>
              Withdrawn {formatMoment(consent.withdrawnAt)} by {consent.withdrawnByName}
            </li>
          )}
        </ul>
      )}
      {!consent && (
        <p className="font-body text-sm text-on-surface-variant">
          A phone number is kept only with the visitor’s consent.
        </p>
      )}

      {!readOnly && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={open}>
            {live ? "Change number" : givenBefore ? "Consent given again" : "Add a phone"}
          </Button>
          {live && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(true)}>
              Withdraw consent
            </Button>
          )}
        </div>
      )}

      {editing && (
        <form
          className="mt-4 space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={live ? "New phone" : "Phone"} htmlFor="consent-phone">
            <Input
              id="consent-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0772 123456"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          {!live && (
            <div className="flex items-start gap-3 rounded-md bg-surface-low p-3">
              <Checkbox
                id="consent-tick"
                checked={ticked}
                onCheckedChange={(checked) => setTicked(checked === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="consent-tick"
                className="font-body text-sm font-normal leading-snug text-on-surface"
              >
                The visitor agreed that the church may keep this number to follow up
                with them.
              </Label>
            </div>
          )}
          {givenBefore && (
            <Field
              label="Why consent is given again"
              htmlFor="consent-note"
              hint="Required, because they withdrew it before."
            >
              <Textarea
                id="consent-note"
                rows={2}
                maxLength={HOSPITALITY_NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={busy}>
              Save
            </Button>
          </div>
        </form>
      )}

      <AlertDialog
        open={confirmWithdraw}
        onOpenChange={(next) => !next && !busy && setConfirmWithdraw(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw consent?</AlertDialogTitle>
            <AlertDialogDescription>
              The phone number is deleted now and the call, WhatsApp and SMS buttons
              disappear. The church will not text them. You can add a number again
              later only with their consent and a note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="font-body text-sm text-error">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep consent</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={busy} onClick={withdraw}>
              Withdraw consent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
