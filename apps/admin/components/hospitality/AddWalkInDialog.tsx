"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import {
  AGE_BRACKETS,
  PROFILE_NAME_MAX,
  SEX,
  VISITOR_AGE_BRACKET_LABELS,
  VISITOR_INVITED_BY_MAX,
  VISITOR_NOTES_MAX,
  VISITOR_SEX_LABELS,
  VISIT_BACKDATE_MAX_DAYS,
  addWalkInSchema,
  kampalaToday,
  type AgeBracket,
  type Sex,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
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
import { DatePicker } from "@/components/ui/DatePicker";
import { formatDateKey, hospitalityError, keyToMs, msToKey } from "./hospitalityErrors";

/** "Not recorded" in the two optional selects. */
const NOT_RECORDED = "none";

type FieldErrors = Partial<Record<string, string>>;

/**
 * Add a walk in at the welcome desk (spec 0024, AC-4 to AC-6, AC-38).
 *
 * A centred modal, one column at every width, so it works one handed on a
 * phone at the door. The fields scroll inside it; the buttons stay in view.
 * The consent tick appears as soon as a phone is typed and is required for
 * it; the server refuses a phone without consent too, so this is only the
 * early warning, not the rule.
 *
 * "Invited by" is one field: typing searches verified members, and choosing
 * one links the real person. Leaving it as typed text keeps the free text,
 * for an inviter who is not in the app.
 */
export function AddWalkInDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (visitorId: Id<"visitors">) => void;
}) {
  const addWalkIn = useMutation(api.hospitality.addWalkIn);
  const recordVisit = useMutation(api.hospitality.recordVisit);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [visitDate, setVisitDate] = useState(() => kampalaToday());
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [sex, setSex] = useState<string>(NOT_RECORDED);
  const [ageBracket, setAgeBracket] = useState<string>(NOT_RECORDED);
  const [invitedBy, setInvitedBy] = useState("");
  const [inviter, setInviter] = useState<{ userId: Id<"users">; name: string } | null>(null);
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordingFor, setRecordingFor] = useState<Id<"visitors"> | null>(null);
  // The phone as last typed, settled for a moment, for the duplicate check.
  const [settledPhone, setSettledPhone] = useState("");

  // Fresh form every time the dialog opens, dated today.
  useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setVisitDate(kampalaToday());
    setPhone("");
    setConsent(false);
    setSex(NOT_RECORDED);
    setAgeBracket(NOT_RECORDED);
    setInvitedBy("");
    setInviter(null);
    setNotes("");
    setSettledPhone("");
    setErrors({});
    setSaveError(null);
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setSettledPhone(phone.trim()), 400);
    return () => clearTimeout(timer);
  }, [phone]);

  // AC-7: someone already on the list with this phone. Offered, never
  // forced: the team can still save a new visitor (a shared family phone).
  const phoneMatches = useAuthQuery(
    api.hospitality.findVisitorsByPhone,
    open && settledPhone.length >= 9 ? { phone: settledPhone } : "skip",
  );

  async function recordForExisting(visitorId: Id<"visitors">) {
    setRecordingFor(visitorId);
    setSaveError(null);
    try {
      await recordVisit({ visitorId, visitDate });
      onAdded?.(visitorId);
      onOpenChange(false);
    } catch (caught) {
      setSaveError(hospitalityError(caught));
    } finally {
      setRecordingFor(null);
    }
  }

  const searchTerm = inviter ? "" : invitedBy.trim();
  const inviterMatches = useAuthQuery(
    api.hospitality.searchInviters,
    open && searchTerm.length >= 2 ? { query: searchTerm } : "skip",
  );

  async function save() {
    const today = kampalaToday();
    const parsed = addWalkInSchema(today).safeParse({
      firstName,
      lastName,
      phone,
      consent,
      sex: sex === NOT_RECORDED ? undefined : sex,
      ageBracket: ageBracket === NOT_RECORDED ? undefined : ageBracket,
      invitedByText: inviter ? undefined : invitedBy,
      notes,
      visitDate,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveError(null);
    try {
      const { visitorId } = await addWalkIn({
        ...parsed.data,
        sex: parsed.data.sex as Sex | undefined,
        ageBracket: parsed.data.ageBracket as AgeBracket | undefined,
        consent: parsed.data.phone ? parsed.data.consent : undefined,
        invitedByUserId: inviter?.userId,
      });
      onAdded?.(visitorId);
      onOpenChange(false);
    } catch (caught) {
      setSaveError(hospitalityError(caught));
    } finally {
      setSaving(false);
    }
  }

  const hasPhone = phone.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <AnimatedDialogContent open={open} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a walk in</DialogTitle>
          <DialogDescription>
            Only the first name and the visit date are needed. Everything else
            helps the follow up.
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
          <div className="subtle-scrollbar max-h-[65vh] space-y-4 overflow-y-auto px-1 pb-1">
            <Field label="First name" htmlFor="walkin-first" error={errors.firstName}>
              <Input
                id="walkin-first"
                autoFocus
                autoComplete="off"
                value={firstName}
                maxLength={PROFILE_NAME_MAX}
                onChange={(event) => setFirstName(event.target.value)}
                aria-invalid={errors.firstName ? true : undefined}
              />
            </Field>

            <Field
              label="Last name"
              htmlFor="walkin-last"
              error={errors.lastName}
              hint="Optional."
            >
              <Input
                id="walkin-last"
                autoComplete="off"
                value={lastName}
                maxLength={PROFILE_NAME_MAX}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>

            <Field
              label="Visit date"
              htmlFor="walkin-date"
              error={errors.visitDate}
              hint={`Today, or up to ${VISIT_BACKDATE_MAX_DAYS} days back.`}
            >
              <DatePicker
                id="walkin-date"
                value={keyToMs(visitDate)}
                onChange={(ms) => setVisitDate(ms === undefined ? "" : msToKey(ms))}
              />
            </Field>

            <Field
              label="Phone"
              htmlFor="walkin-phone"
              error={errors.phone}
              hint="Optional. Kept only with the visitor's consent."
            >
              <Input
                id="walkin-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0772 123456"
              />
            </Field>

            {hasPhone && phoneMatches && phoneMatches.length > 0 && (
              <div
                role="status"
                className="space-y-2 rounded-md bg-warning-light p-3"
              >
                <p className="font-body text-sm text-on-surface">
                  {phoneMatches.length === 1
                    ? "Someone on the list already has this number."
                    : "People on the list already have this number."}
                </p>
                <ul className="space-y-2">
                  {phoneMatches.map((match) => (
                    <li key={match._id}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-auto min-h-9 w-full justify-start whitespace-normal py-2 text-left"
                        loading={recordingFor === match._id}
                        disabled={saving || recordingFor !== null}
                        onClick={() => void recordForExisting(match._id)}
                      >
                        Record a visit for {match.displayName} instead
                      </Button>
                      <p className="mt-1 font-body text-xs text-on-surface-variant">
                        <span className="font-mono">{match.visitCount}</span>{" "}
                        {match.visitCount === 1 ? "visit" : "visits"}, last{" "}
                        <span className="font-mono">{formatDateKey(match.lastVisitDate)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="font-body text-xs text-on-surface-variant">
                  Or carry on and save them as a new visitor.
                </p>
              </div>
            )}

            {hasPhone && (
              <div className="space-y-1.5 rounded-md bg-surface-low p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="walkin-consent"
                    checked={consent}
                    onCheckedChange={(checked) => setConsent(checked === true)}
                    aria-invalid={errors.consent ? true : undefined}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="walkin-consent"
                    className="font-body text-sm font-normal leading-snug text-on-surface"
                  >
                    The visitor agreed that the church may keep this number to
                    follow up with them.
                  </Label>
                </div>
                {errors.consent && (
                  <p className="font-body text-xs text-destructive">{errors.consent}</p>
                )}
              </div>
            )}

            <Field label="Sex" htmlFor="walkin-sex" hint="Optional.">
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger id="walkin-sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_RECORDED}>Not recorded</SelectItem>
                  {SEX.map((value) => (
                    <SelectItem key={value} value={value}>
                      {VISITOR_SEX_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Age group" htmlFor="walkin-age" hint="Optional.">
              <Select value={ageBracket} onValueChange={setAgeBracket}>
                <SelectTrigger id="walkin-age">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_RECORDED}>Not recorded</SelectItem>
                  {AGE_BRACKETS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {VISITOR_AGE_BRACKET_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Invited by"
              htmlFor="walkin-invited"
              error={errors.invitedByText}
              hint={
                inviter
                  ? "Linked to this member."
                  : "Optional. Type a name; choose a member if they appear."
              }
            >
              {inviter ? (
                <div className="flex h-11 items-center justify-between gap-2 rounded-md bg-surface-low px-3">
                  <span className="truncate font-body text-sm text-on-surface">
                    {inviter.name}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-body text-sm font-semibold text-primary hover:underline"
                    onClick={() => {
                      setInvitedBy(inviter.name);
                      setInviter(null);
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <Input
                  id="walkin-invited"
                  autoComplete="off"
                  value={invitedBy}
                  maxLength={VISITOR_INVITED_BY_MAX}
                  onChange={(event) => setInvitedBy(event.target.value)}
                />
              )}
            </Field>
            {!inviter && inviterMatches && inviterMatches.length > 0 && (
              <ul
                aria-label="Matching members"
                className="-mt-2 space-y-1 rounded-md bg-surface-low p-1"
              >
                {inviterMatches.slice(0, 5).map((match) => (
                  <li key={match.userId}>
                    <button
                      type="button"
                      className="w-full rounded-sm px-3 py-2 text-left font-body text-sm text-on-surface hover:bg-surface-lowest"
                      onClick={() => setInviter(match)}
                    >
                      {match.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Field
              label="Notes"
              htmlFor="walkin-notes"
              error={errors.notes}
              hint="Optional."
            >
              <Textarea
                id="walkin-notes"
                rows={3}
                value={notes}
                maxLength={VISITOR_NOTES_MAX}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>

            {saveError && (
              <p
                role="alert"
                className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error"
              >
                {saveError}
              </p>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={saving || recordingFor !== null}
            >
              {phoneMatches && phoneMatches.length > 0 && hasPhone
                ? "Save as a new visitor"
                : "Save walk in"}
            </Button>
          </DialogFooter>
        </form>
      </AnimatedDialogContent>
    </Dialog>
  );
}
