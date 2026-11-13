"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, UserRound } from "lucide-react";
import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_OUTCOME_LABELS,
  VISITOR_KIND_LABELS,
  VISIT_BACKDATE_MAX_DAYS,
  isRegularOn,
  kampalaToday,
  type FollowUpOutcome,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
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
import { Skeleton } from "@/components/shadcn/skeleton";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Heading } from "@/components/ui/Heading";
import {
  AssignFollowUpDialog,
  CloseFollowUpDialog,
  ContactActions,
  LogContactDialog,
  type ContactTarget,
} from "./FollowUpActions";
import { JoinAccountCard } from "./JoinAccountCard";
import { RemoveVisitorDialog } from "./RemoveVisitorDialog";
import { VisitorConsentCard } from "./VisitorConsentCard";
import { VisitorDetailsCard } from "./VisitorDetailsCard";
import {
  formatDateKey,
  formatMoment,
  hospitalityError,
  keyToMs,
  msToKey,
} from "./hospitalityErrors";

export type VisitorRecordData = NonNullable<
  FunctionReturnType<typeof api.hospitality.getVisitor>
>;

const SECTION = "rounded-md border border-border bg-surface-lowest p-5 shadow-e1";

const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  reached: "Reached",
  wrong_number: "Wrong number",
  do_not_contact: "Asked not to be contacted",
  closed: "Closed",
};

/** What each audit entry on a visitor means, in the team's words. */
const HISTORY_LABELS: Record<string, string> = {
  "hospitality.walk_in_added": "Added as a walk in",
  "hospitality.visit_recorded": "Visit recorded",
  "hospitality.visit_deleted": "Visit deleted",
  "hospitality.visitor_updated": "Details edited",
  "hospitality.consent_given": "Consent given with a phone",
  "hospitality.consent_given_again": "Consent given again",
  "hospitality.phone_changed": "Phone changed",
  "hospitality.consent_withdrawn": "Consent withdrawn",
  "hospitality.visitor_removed": "Removed on request",
  "hospitality.visitor_joined": "Joined to an app account",
};

const STATUS_NOTE: Record<string, string> = {
  member: "Verified as a member, so they have left the Visitors list.",
  merged: "Joined into another visitor record. This one is kept as history.",
  removed: "Removed. Personal details are gone; only the visit dates remain.",
};

/**
 * One visitor's record (spec 0024, AC-12 to AC-14, AC-23 to AC-25).
 *
 * Details and consent are editable; visits are recorded and corrected here;
 * the follow up and the contact history are shown as they stand (their
 * actions arrive with the Follow ups slice). Every staff name whose account
 * is gone reads "a former member".
 */
export function VisitorRecordPage({ visitorId }: { visitorId: Id<"visitors"> }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const listHref = `/areas-of-service/${slug}/visitors`;
  const record = useAuthQuery(api.hospitality.getVisitor, { visitorId });
  const [removing, setRemoving] = useState(false);

  if (record === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56 rounded-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (record === null) {
    return (
      <div className="flex justify-center py-16">
        <EmptyState
          icon={<UserRound className="h-5 w-5" aria-hidden />}
          title="Visitor not found"
          message="This record no longer exists."
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push(listHref)}>
              Back to visitors
            </Button>
          }
        />
      </div>
    );
  }

  const today = kampalaToday();
  // Merged and removed rows are history; a member's row is still editable.
  const readOnly = record.listStatus === "merged" || record.listStatus === "removed";
  const canRecordVisit = record.listStatus === "active";
  const regular = isRegularOn(record.lastRegularMonth, today);

  return (
    <div className="space-y-6">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 font-body text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Visitors
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading as="h1" size="xl" className="break-words">
            {record.displayName}
          </Heading>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{VISITOR_KIND_LABELS[record.kind]}</Badge>
            {record.hasAccount && record.kind === "walk_in" && (
              <Badge variant="visitor">Joined to an app account</Badge>
            )}
            {record.visitCount === 1 && <Badge variant="member">First timer</Badge>}
            {regular && <Badge variant="role">Regular</Badge>}
          </div>
        </div>
        {record.canRemove && (
          <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>
            Remove visitor
          </Button>
        )}
      </div>

      {record.listStatus !== "active" && STATUS_NOTE[record.listStatus] && (
        <p className="rounded-md bg-surface-low px-4 py-3 font-body text-sm text-on-surface-variant">
          {STATUS_NOTE[record.listStatus]}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <VisitorDetailsCard record={record} readOnly={readOnly} />
        <div className="space-y-6">
          <VisitorConsentCard record={record} readOnly={readOnly} />
          <FollowUpSummary record={record} readOnly={readOnly} />
        </div>
      </div>

      <VisitsCard record={record} canRecord={canRecordVisit} />
      {record.canJoin && (
        <JoinAccountCard visitorId={record._id} name={record.displayName} />
      )}
      <ContactsCard record={record} readOnly={readOnly} />
      <HistoryCard record={record} />

      <RemoveVisitorDialog
        visitorId={record._id}
        name={record.displayName}
        open={removing}
        onOpenChange={setRemoving}
        onRemoved={() => router.push(listHref)}
      />
    </div>
  );
}

// -- Visits ------------------------------------------------------------------

function VisitsCard({ record, canRecord }: { record: VisitorRecordData; canRecord: boolean }) {
  const recordVisit = useMutation(api.hospitality.recordVisit);
  const deleteVisit = useMutation(api.hospitality.deleteVisit);
  const [date, setDate] = useState(() => kampalaToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ _id: Id<"visitorVisits">; visitDate: string } | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await recordVisit({ visitorId: record._id, visitDate: date });
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteVisit({ visitId: deleting._id });
      setDeleting(null);
    } catch (caught) {
      setDeleteError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={SECTION}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <Heading as="h2" size="lg">
          Visits
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          <span className="font-mono">{record.visitCount}</span>{" "}
          {record.visitCount === 1 ? "visit" : "visits"}
        </p>
      </div>

      {canRecord && (
        <div className="mb-4 space-y-2 rounded-md bg-surface-low p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <DatePicker
              id="record-visit-date"
              className="sm:max-w-56"
              value={keyToMs(date)}
              onChange={(ms) => setDate(ms === undefined ? kampalaToday() : msToKey(ms))}
            />
            <Button variant="primary" size="sm" loading={busy} disabled={busy} onClick={add}>
              Record a visit
            </Button>
          </div>
          <p className="font-body text-xs text-on-surface-variant">
            Today, or up to {VISIT_BACKDATE_MAX_DAYS} days back.
          </p>
          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}
        </div>
      )}

      {record.visits.length === 0 ? (
        <p className="font-body text-sm text-on-surface-variant">
          No visits recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {record.visits.map((visit) => (
            <li key={visit._id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm text-on-surface">{formatDateKey(visit.visitDate)}</p>
                <p className="truncate font-body text-xs text-on-surface-variant">
                  Recorded by {visit.recordedByName}
                </p>
              </div>
              {visit.canDelete && canRecord && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(visit);
                  }}
                >
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && !busy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete the visit on {deleting ? formatDateKey(deleting.visitDate) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use this for a visit recorded by mistake. Their visit count and flags
              update straight away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="font-body text-sm text-error">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep visit</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={busy} onClick={confirmDelete}>
              Delete visit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// -- Follow up, contacts, history -------------------------------------------

function contactTarget(record: VisitorRecordData): ContactTarget {
  return {
    visitorId: record._id,
    firstName: record.firstName,
    phone: record.phone,
    hasAccount: record.hasAccount,
    firstVisitDate: record.firstVisitDate,
    lastVisitDate: record.lastVisitDate,
  };
}

function FollowUpSummary({
  record,
  readOnly,
}: {
  record: VisitorRecordData;
  readOnly: boolean;
}) {
  const followUp = record.followUp;
  const [dialog, setDialog] = useState<"assign" | "close" | null>(null);
  const canAct = followUp?.status === "open" && !readOnly;
  return (
    <section className={SECTION}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Heading as="h2" size="lg">
          Follow up
        </Heading>
        {followUp && (
          <Badge variant={followUp.status === "open" ? "pending" : "verified"}>
            {followUp.status === "open"
              ? "Open"
              : FOLLOW_UP_OUTCOME_LABELS[followUp.outcome ?? "closed"]}
          </Badge>
        )}
      </div>
      {!followUp ? (
        <p className="font-body text-sm text-on-surface-variant">
          A follow up starts with their first recorded visit.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 font-body text-sm">
          <div>
            <dt className="text-xs text-on-surface-variant">First visit</dt>
            <dd className="font-mono text-on-surface">{formatDateKey(followUp.firstVisitDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">Attempts</dt>
            <dd className="font-mono text-on-surface">{followUp.attemptCount}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-on-surface-variant">Assigned to</dt>
            <dd className="text-on-surface">{followUp.assignedToName ?? "Unassigned"}</dd>
          </div>
          {followUp.closedAt !== undefined && (
            <div className="col-span-2">
              <dt className="text-xs text-on-surface-variant">Closed</dt>
              <dd className="text-on-surface">
                {formatMoment(followUp.closedAt)}
                {followUp.closedByName ? ` by ${followUp.closedByName}` : ""}
                {followUp.closeNote ? `: “${followUp.closeNote}”` : ""}
              </dd>
            </div>
          )}
        </dl>
      )}
      {canAct && followUp && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog("assign")}>
              {followUp.assignedTo ? "Reassign" : "Assign"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDialog("close")}>
              Close follow up
            </Button>
          </div>
          <AssignFollowUpDialog
            open={dialog === "assign"}
            onOpenChange={(next) => !next && setDialog(null)}
            followUpId={followUp._id}
            visitorName={record.displayName}
            currentAssignee={followUp.assignedTo}
          />
          <CloseFollowUpDialog
            open={dialog === "close"}
            onOpenChange={(next) => !next && setDialog(null)}
            followUpId={followUp._id}
            visitorName={record.displayName}
          />
        </>
      )}
    </section>
  );
}

function ContactsCard({
  record,
  readOnly,
}: {
  record: VisitorRecordData;
  readOnly: boolean;
}) {
  const [logging, setLogging] = useState(false);
  const [channel, setChannel] = useState<"call" | "whatsapp" | "sms" | "in_person" | undefined>();
  // A contact moves the follow up only while it is open; otherwise it is
  // just logged (AC-18). The client names it; the server never infers one.
  const openFollowUpId =
    record.followUp?.status === "open" ? record.followUp._id : undefined;
  const target = contactTarget(record);
  return (
    <section className={SECTION}>
      <Heading as="h2" size="lg" className="mb-4">
        Contact history
      </Heading>
      {!readOnly && (
        <div className="mb-4 space-y-3 rounded-md bg-surface-low p-3">
          <ContactActions
            target={target}
            defaultTemplate={openFollowUpId ? "first_visit_thanks" : "follow_up"}
            onTapped={(tapped) => {
              setChannel(tapped);
              setLogging(true);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setChannel(undefined);
              setLogging(true);
            }}
          >
            Record a contact
          </Button>
          <LogContactDialog
            open={logging}
            onOpenChange={setLogging}
            target={target}
            followUpId={openFollowUpId}
            initialChannel={channel}
          />
        </div>
      )}
      {record.contacts.length === 0 ? (
        <p className="font-body text-sm text-on-surface-variant">Nobody has contacted them yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {record.contacts.map((contact) => (
            <li key={contact._id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{CONTACT_CHANNEL_LABELS[contact.channel]}</Badge>
                {contact.outcome && (
                  <span className="font-body text-sm font-medium text-on-surface">
                    {CONTACT_OUTCOME_LABELS[contact.outcome]}
                  </span>
                )}
              </div>
              {contact.note && (
                <p className="break-words font-body text-sm text-on-surface">{contact.note}</p>
              )}
              <p className="font-body text-xs text-on-surface-variant">
                {contact.byName} · {formatMoment(contact.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryCard({ record }: { record: VisitorRecordData }) {
  if (record.history.length === 0) return null;
  return (
    <section className={SECTION}>
      <Heading as="h2" size="lg" className="mb-4">
        History
      </Heading>
      <ul className="space-y-2">
        {record.history.map((entry) => (
          <li
            key={entry._id}
            className="flex flex-col gap-0.5 font-body text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
          >
            <span className="text-on-surface">
              {HISTORY_LABELS[entry.action] ?? "Updated"}{" "}
              <span className="text-on-surface-variant">by {entry.byName}</span>
            </span>
            <span className="shrink-0 text-xs text-on-surface-variant">{formatMoment(entry.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
