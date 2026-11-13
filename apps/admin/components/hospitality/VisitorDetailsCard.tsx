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
  type AgeBracket,
  type Sex,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
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
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { hospitalityError } from "./hospitalityErrors";
import type { VisitorRecordData } from "./VisitorRecordPage";

const NOT_RECORDED = "none";

type Clearable =
  | "lastName"
  | "sex"
  | "ageBracket"
  | "invitedByText"
  | "invitedByUserId"
  | "notes";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="font-body text-xs text-on-surface-variant">{label}</dt>
      <dd className="break-words font-body text-sm text-on-surface">
        {value || <span className="text-on-surface-variant">Not recorded</span>}
      </dd>
    </div>
  );
}

/**
 * The visitor's details, read and edit (spec 0024, AC-14).
 *
 * A walk in's every AC-4 field is editable; an app visitor's name belongs to
 * their account, so only the rest is. The phone is not here at all: it
 * changes through the consent panel, so the consent is recorded with it
 * (AC-24). Only fields that really changed are sent, and a cleared field is
 * sent as a clear, so an untouched save is a quiet no op on the server.
 */
export function VisitorDetailsCard({
  record,
  readOnly,
}: {
  record: VisitorRecordData;
  readOnly: boolean;
}) {
  const updateVisitor = useMutation(api.hospitality.updateVisitor);
  const [editing, setEditing] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState<string>(NOT_RECORDED);
  const [ageBracket, setAgeBracket] = useState<string>(NOT_RECORDED);
  const [invitedBy, setInvitedBy] = useState("");
  const [inviter, setInviter] = useState<{ userId: Id<"users">; name: string } | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start every edit from the record as it is now.
  useEffect(() => {
    if (!editing) return;
    setFirstName(record.firstName);
    setLastName(record.lastName ?? "");
    setSex(record.sex ?? NOT_RECORDED);
    setAgeBracket(record.ageBracket ?? NOT_RECORDED);
    setInviter(
      record.invitedByUserId && record.invitedByName
        ? { userId: record.invitedByUserId, name: record.invitedByName }
        : null,
    );
    setInvitedBy(record.invitedByText ?? "");
    setNotes(record.notes ?? "");
    setError(null);
    // Only on opening the editor, not on every live update while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const searchTerm = editing && !inviter ? invitedBy.trim() : "";
  const inviterMatches = useAuthQuery(
    api.hospitality.searchInviters,
    searchTerm.length >= 2 ? { query: searchTerm } : "skip",
  );

  async function save() {
    const patch: {
      firstName?: string;
      lastName?: string;
      sex?: Sex;
      ageBracket?: AgeBracket;
      invitedByText?: string;
      invitedByUserId?: Id<"users">;
      notes?: string;
    } = {};
    const clear: Clearable[] = [];

    const text = (
      field: "lastName" | "invitedByText" | "notes",
      next: string,
      current: string | undefined,
    ) => {
      const trimmed = next.trim();
      if (trimmed === (current ?? "")) return;
      if (trimmed) patch[field] = trimmed;
      else if (current) clear.push(field);
    };

    if (record.canEditName) {
      const trimmed = firstName.trim();
      if (!trimmed) {
        setError("Enter the visitor’s first name.");
        return;
      }
      if (trimmed !== record.firstName) patch.firstName = trimmed;
      text("lastName", lastName, record.lastName);
    }
    const nextSex = sex === NOT_RECORDED ? undefined : (sex as Sex);
    if (nextSex !== record.sex) {
      if (nextSex) patch.sex = nextSex;
      else clear.push("sex");
    }
    const nextAge = ageBracket === NOT_RECORDED ? undefined : (ageBracket as AgeBracket);
    if (nextAge !== record.ageBracket) {
      if (nextAge) patch.ageBracket = nextAge;
      else clear.push("ageBracket");
    }
    // Invited by is one field: a linked member, or free text, never both.
    if (inviter) {
      if (inviter.userId !== record.invitedByUserId) patch.invitedByUserId = inviter.userId;
      if (record.invitedByText) clear.push("invitedByText");
    } else {
      text("invitedByText", invitedBy, record.invitedByText);
      if (record.invitedByUserId) clear.push("invitedByUserId");
    }
    text("notes", notes, record.notes);

    if (Object.keys(patch).length === 0 && clear.length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateVisitor({
        visitorId: record._id,
        ...patch,
        ...(clear.length > 0 ? { clear } : {}),
      });
      setEditing(false);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setSaving(false);
    }
  }

  const invitedByLabel = record.invitedByName ?? record.invitedByText;

  return (
    <section className="rounded-md border border-border bg-surface-lowest p-5 shadow-e1">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Heading as="h2" size="lg">
          Details
        </Heading>
        {!editing && !readOnly && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailRow label="First name" value={record.firstName} />
          <DetailRow label="Last name" value={record.lastName} />
          {record.accountEmail && <DetailRow label="App account" value={record.accountEmail} />}
          <DetailRow label="Sex" value={record.sex ? VISITOR_SEX_LABELS[record.sex] : null} />
          <DetailRow
            label="Age group"
            value={record.ageBracket ? VISITOR_AGE_BRACKET_LABELS[record.ageBracket] : null}
          />
          <DetailRow label="Invited by" value={invitedByLabel} />
          <div className="sm:col-span-2">
            <DetailRow label="Notes" value={record.notes} />
          </div>
        </dl>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {record.canEditName ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="visitor-first">
                <Input
                  id="visitor-first"
                  value={firstName}
                  maxLength={PROFILE_NAME_MAX}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </Field>
              <Field label="Last name" htmlFor="visitor-last" hint="Optional.">
                <Input
                  id="visitor-last"
                  value={lastName}
                  maxLength={PROFILE_NAME_MAX}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <p className="rounded-md bg-surface-low px-3 py-2 font-body text-sm text-on-surface-variant">
              The name comes from their app account, so it is changed there.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Sex" htmlFor="visitor-sex">
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger id="visitor-sex">
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
            <Field label="Age group" htmlFor="visitor-age">
              <Select value={ageBracket} onValueChange={setAgeBracket}>
                <SelectTrigger id="visitor-age">
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
          </div>

          <Field
            label="Invited by"
            htmlFor="visitor-invited"
            hint={inviter ? "Linked to this member." : "Type a name; choose a member if they appear."}
          >
            {inviter ? (
              <div className="flex h-11 items-center justify-between gap-2 rounded-md bg-surface-low px-3">
                <span className="truncate font-body text-sm text-on-surface">{inviter.name}</span>
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
                id="visitor-invited"
                autoComplete="off"
                value={invitedBy}
                maxLength={VISITOR_INVITED_BY_MAX}
                onChange={(event) => setInvitedBy(event.target.value)}
              />
            )}
          </Field>
          {!inviter && inviterMatches && inviterMatches.length > 0 && (
            <ul aria-label="Matching members" className="-mt-2 space-y-1 rounded-md bg-surface-low p-1">
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

          <Field label="Notes" htmlFor="visitor-notes">
            <Textarea
              id="visitor-notes"
              rows={3}
              value={notes}
              maxLength={VISITOR_NOTES_MAX}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saving}>
              Save details
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
