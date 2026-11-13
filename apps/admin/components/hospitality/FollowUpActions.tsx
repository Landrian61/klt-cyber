"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { MessageCircle, MessageSquareText, Phone } from "lucide-react";
import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_NOTE_MAX,
  CONTACT_OUTCOMES,
  CONTACT_OUTCOME_LABELS,
  HOSPITALITY_MESSAGE_TEMPLATES,
  HOSPITALITY_NOTE_MAX,
  LOGGED_CONTACT_CHANNELS,
  fillHospitalityTemplate,
  hospitalityContactLinks,
  type ContactOutcome,
  type HospitalityTemplateKey,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Field } from "@/components/shadcn/field";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Button } from "@/components/ui/Button";
import { hospitalityError } from "./hospitalityErrors";

type LoggedChannel = (typeof LOGGED_CONTACT_CHANNELS)[number];

/** The visitor facts the one tap buttons need. */
export interface ContactTarget {
  visitorId: Id<"visitors">;
  firstName: string;
  phone?: string;
  hasAccount: boolean;
  firstVisitDate?: string;
  lastVisitDate?: string;
}

/**
 * The app download link the `app_invite` template sends (spec 0024 value
 * sourcing). Set per Cloudflare environment; unset means the invite is off.
 */
const APP_LINK = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL ?? "";

/**
 * Call, WhatsApp and SMS in one tap (AC-17).
 *
 * Shown only when the visitor has a phone, which by AC-22 means live consent.
 * WhatsApp and SMS open pre filled with the chosen wording; the operator's own
 * phone sends it, and the server sends nothing. After any tap, `onTapped`
 * lets the caller open the log contact dialog on that channel (AC-18).
 */
export function ContactActions({
  target,
  defaultTemplate = "first_visit_thanks",
  onTapped,
}: {
  target: ContactTarget;
  defaultTemplate?: HospitalityTemplateKey;
  onTapped: (channel: LoggedChannel) => void;
}) {
  const [template, setTemplate] = useState<HospitalityTemplateKey>(defaultTemplate);
  if (!target.phone) {
    return (
      <p className="font-body text-xs text-on-surface-variant">
        No phone kept with consent, so only in person contact can be logged.
      </p>
    );
  }

  // The app invite is for someone without the app yet (H4-02).
  const templates = (Object.keys(HOSPITALITY_MESSAGE_TEMPLATES) as HospitalityTemplateKey[]).filter(
    (key) => key !== "app_invite" || !target.hasAccount,
  );
  const inviteBlocked = template === "app_invite" && !APP_LINK;
  const message = fillHospitalityTemplate(template, {
    firstName: target.firstName,
    visitDate:
      template === "first_visit_thanks" ? target.firstVisitDate : target.lastVisitDate,
    appLink: APP_LINK,
  });
  const links = hospitalityContactLinks(target.phone, message);
  const linkClass =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-4 font-body text-sm font-semibold text-primary transition-colors hover:bg-primary-light";

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`template-${target.visitorId}`} className="font-body text-xs text-on-surface-variant">
          Message for WhatsApp and SMS
        </Label>
        <Select value={template} onValueChange={(value) => setTemplate(value as HospitalityTemplateKey)}>
          <SelectTrigger id={`template-${target.visitorId}`} className="w-full sm:max-w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((key) => (
              <SelectItem key={key} value={key}>
                {HOSPITALITY_MESSAGE_TEMPLATES[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={links.call} className={linkClass} onClick={() => onTapped("call")}>
          <Phone className="h-4 w-4" aria-hidden />
          Call
        </a>
        {inviteBlocked ? (
          <p className="self-center font-body text-xs text-on-surface-variant">
            App link not set up yet.
          </p>
        ) : (
          <>
            <a
              href={links.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              onClick={() => onTapped("whatsapp")}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              WhatsApp
            </a>
            <a href={links.sms} className={linkClass} onClick={() => onTapped("sms")}>
              <MessageSquareText className="h-4 w-4" aria-hidden />
              SMS
            </a>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Record how a contact went (AC-18). With a `followUpId` the outcome moves
 * the follow up; without one it is only logged. The warning under the two
 * outcomes that remove the phone says so before the save, not after.
 */
export function LogContactDialog({
  open,
  onOpenChange,
  target,
  followUpId,
  initialChannel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ContactTarget;
  followUpId?: Id<"followUps">;
  initialChannel?: LoggedChannel;
}) {
  const recordContact = useMutation(api.hospitality.recordContact);
  const hasPhone = target.phone !== undefined;
  const fallback: LoggedChannel = hasPhone ? "call" : "in_person";
  const [channel, setChannel] = useState<LoggedChannel>(initialChannel ?? fallback);
  const [outcome, setOutcome] = useState<ContactOutcome>("reached");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChannel(initialChannel ?? fallback);
    setOutcome("reached");
    setNote("");
    setError(null);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await recordContact({
        visitorId: target.visitorId,
        ...(followUpId ? { followUpId } : {}),
        channel,
        outcome,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onOpenChange(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  const removesPhone = outcome === "wrong_number" || outcome === "do_not_contact";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How did it go with {target.firstName}?</DialogTitle>
          <DialogDescription>
            {followUpId
              ? "This updates their follow up."
              : "Logged on their record. No follow up is open."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Channel" htmlFor="contact-channel">
              <Select value={channel} onValueChange={(value) => setChannel(value as LoggedChannel)}>
                <SelectTrigger id="contact-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGGED_CONTACT_CHANNELS.filter(
                    (value) => hasPhone || value === "in_person",
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {CONTACT_CHANNEL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Outcome" htmlFor="contact-outcome">
              <Select value={outcome} onValueChange={(value) => setOutcome(value as ContactOutcome)}>
                <SelectTrigger id="contact-outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_OUTCOMES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CONTACT_OUTCOME_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {removesPhone && (
            <p className="rounded-md bg-warning-light px-3 py-2 font-body text-sm text-on-surface">
              {outcome === "do_not_contact"
                ? "Their consent is withdrawn and the phone number is deleted."
                : "The phone number and its consent are deleted."}
            </p>
          )}
          <Field label="Note" htmlFor="contact-note" hint="Optional.">
            <Textarea
              id="contact-note"
              rows={3}
              maxLength={CONTACT_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
              {error}
            </p>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={busy}>
              Save contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Give an open follow up to a teammate, or take it (AC-20). The list is the
 * server's `listAssignableOperators`; the server re-checks the choice.
 */
export function AssignFollowUpDialog({
  open,
  onOpenChange,
  followUpId,
  visitorName,
  currentAssignee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  followUpId: Id<"followUps">;
  visitorName: string;
  currentAssignee?: Id<"users">;
}) {
  const assign = useMutation(api.hospitality.assignFollowUp);
  const operators = useAuthQuery(api.hospitality.listAssignableOperators, open ? {} : "skip");
  const [choice, setChoice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setChoice(currentAssignee ?? "");
      setError(null);
    }
  }, [open, currentAssignee]);

  async function save() {
    if (!choice) {
      setError("Choose someone on the team.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await assign({ followUpId, assigneeUserId: choice as Id<"users"> });
      onOpenChange(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who follows up with {visitorName}?</DialogTitle>
          <DialogDescription>They get a notification, unless it is you.</DialogDescription>
        </DialogHeader>
        <Field label="Team member" htmlFor="assign-to">
          <Select value={choice} onValueChange={setChoice} disabled={operators === undefined}>
            <SelectTrigger id="assign-to">
              <SelectValue placeholder={operators === undefined ? "Loading…" : "Choose"} />
            </SelectTrigger>
            <SelectContent>
              {(operators ?? []).map((operator) => (
                <SelectItem key={operator.userId} value={operator.userId}>
                  {operator.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {error && <p role="alert" className="font-body text-sm text-error">{error}</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" loading={busy} disabled={busy} onClick={save}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Close an open follow up by hand, with a required reason (AC-19). */
export function CloseFollowUpDialog({
  open,
  onOpenChange,
  followUpId,
  visitorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  followUpId: Id<"followUps">;
  visitorName: string;
}) {
  const close = useMutation(api.hospitality.closeFollowUp);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  async function save() {
    if (!note.trim()) {
      setError("Add a short note saying why.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await close({ followUpId, note: note.trim() });
      onOpenChange(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close the follow up for {visitorName}?</DialogTitle>
          <DialogDescription>
            It moves to Done. Their record and contact history stay as they are.
          </DialogDescription>
        </DialogHeader>
        <Field label="Why" htmlFor="close-note" hint="Required.">
          <Textarea
            id="close-note"
            rows={3}
            maxLength={HOSPITALITY_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {error && <p role="alert" className="font-body text-sm text-error">{error}</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" loading={busy} disabled={busy} onClick={save}>
            Close follow up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
