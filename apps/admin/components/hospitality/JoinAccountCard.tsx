"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link2 } from "lucide-react";

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
import { Heading } from "@/components/ui/Heading";
import { SearchInput } from "@/components/ui/SearchInput";
import { formatDateKey, hospitalityError } from "./hospitalityErrors";

type Candidate = NonNullable<
  FunctionReturnType<typeof api.hospitality.listJoinCandidates>
>[number];

const SECTION = "rounded-md border border-border bg-surface-lowest p-5 shadow-e1";

/**
 * Join this walk in to the app account they turned out to have (AC-27,
 * AC-28). Accounts whose profile phone matches are suggested first; any app
 * visitor can be found by name or email. Confirming keeps this record and
 * moves the account's visits, contacts and follow ups onto it.
 */
export function JoinAccountCard({
  visitorId,
  name,
}: {
  visitorId: Id<"visitors">;
  name: string;
}) {
  const [search, setSearch] = useState("");
  const candidates = useAuthQuery(api.hospitality.listJoinCandidates, {
    visitorId,
    search: search.trim() || undefined,
  });
  const join = useMutation(api.hospitality.joinWalkInToAccount);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await join({ walkInId: visitorId, appVisitorId: chosen._id });
      setChosen(null);
    } catch (caught) {
      setError(hospitalityError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={SECTION}>
      <Heading as="h2" size="lg">
        Join to an app account
      </Heading>
      <p className="mb-4 mt-1 font-body text-sm text-on-surface-variant">
        If {name} has since signed up on the app, join the two so their visits
        and follow ups live in one record.
      </p>
      <SearchInput
        placeholder="Search app visitors by name or email"
        onDebouncedChange={setSearch}
      />
      <div className="mt-3" aria-live="polite">
        {candidates === undefined ? (
          <Skeleton className="h-14 w-full rounded-md" />
        ) : !candidates || candidates.length === 0 ? (
          <p className="font-body text-sm text-on-surface-variant">
            {search.trim()
              ? "No app visitor matches that search."
              : "No account shares their phone number. Search by name or email."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {candidates.map((candidate) => (
              <li
                key={candidate._id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-body text-sm font-medium text-on-surface">
                      {candidate.displayName}
                    </p>
                    {candidate.phoneMatch && (
                      <Badge variant="member">Same phone</Badge>
                    )}
                    {candidate.listStatus === "member" && (
                      <Badge variant="verified">Member</Badge>
                    )}
                  </div>
                  <p className="break-all font-body text-xs text-on-surface-variant">
                    {candidate.email} ·{" "}
                    <span className="font-mono">{candidate.visitCount}</span>{" "}
                    {candidate.visitCount === 1 ? "visit" : "visits"}, last{" "}
                    <span className="font-mono">
                      {formatDateKey(candidate.lastVisitDate)}
                    </span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setChosen(candidate);
                  }}
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                  Join
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={chosen !== null}
        onOpenChange={(next) => !busy && !next && setChosen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Join {name} to {chosen?.displayName}’s account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This record stays, with the names, phone and notes the team
              recorded. The account’s visits, contacts and follow ups move onto
              it, and a visit on the same date is counted once. This cannot be
              undone here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              {busy ? "Joining…" : "Join them"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
