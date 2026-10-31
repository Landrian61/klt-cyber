import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  MAX_ACTIVE_DEPARTMENTS,
  PROFILE_LIFECYCLE_ERRORS,
  profileStaleCause,
  SENT_BACK_REASON_MAX_LENGTH,
  SENT_BACK_REASON_MIN_LENGTH,
} from "@klt-cyber/shared";

// The profile lifecycle's RULES, as pure functions (spec 0014).
//
// They live here rather than inside the mutations that apply them for one
// reason: this is where they can be proved. A mutation resolves its caller
// through the Better Auth component, which the test harness cannot stand up
// (see the note at the top of convex/departmentShell.test.ts), so a rule
// buried in a mutation body can only ever be verified by hand against a
// running app. A rule in an exported function can be tested exactly, in both
// directions, including the edges nobody would think to click.
//
// Each throws `ConvexError({ code })` with a code from
// `PROFILE_LIFECYCLE_ERRORS`, because on a production deployment Convex
// replaces the MESSAGE of an ordinary `Error` with a generic server error: a
// client matching on the message works in development and shows the fallback
// line for every refusal in production. The code survives.

/**
 * Reject a reviewer acting from a screen the owner has since edited (AC-7).
 *
 * `seenUpdatedAt` is the `updatedAt` the reviewer's screen was actually
 * showing. A stored value STRICTLY newer than it means somebody wrote the
 * submission in between, so the patch the reviewer is holding is built on text
 * that no longer exists. Equal is accepted: nothing moved.
 *
 * Why this matters more than its size suggests. Without it, a reviewer who
 * opened a profile a minute ago verifies with the `edits` patch they were
 * looking at, and a correction the person typed in between is overwritten with
 * no error, no log entry and nothing on any screen saying it happened.
 *
 * Every member-owned write bumps `memberProfiles.updatedAt`, including the
 * ones that write a different table (`touchMyProfile`), so this one timestamp
 * covers the whole submission rather than only the profile row's own fields.
 */
export function assertNotStale(
  profile: Pick<Doc<"memberProfiles">, "updatedAt">,
  seenUpdatedAt: number
): void {
  if (profile.updatedAt > seenUpdatedAt) {
    throw new ConvexError({ code: PROFILE_LIFECYCLE_ERRORS.PROFILE_STALE });
  }
}

/**
 * Which of the two stale causes happened, so a reviewer is told the truth.
 *
 * A stored `sentBackAt` newer than the `updatedAt` the reviewer held means a
 * colleague acted first; anything else means the owner edited. Without the
 * split, a reviewer whose colleague sent the same profile back a second
 * earlier is told the person edited their profile, which is simply false.
 *
 * Exported so the two portal screens cannot each derive it differently.
 */
export function staleCause(
  profile: Pick<Doc<"memberProfiles">, "sentBackAt">,
  seenUpdatedAt: number
): "owner_edited" | "other_reviewer" {
  // Delegates to the shared rule, because the portal needs the same answer and
  // cannot import from `convex/lib`. One rule, three readers.
  return profileStaleCause(profile.sentBackAt, seenUpdatedAt);
}

/** The trimmed send-back reason, or a coded rejection (AC-1, AC-32). */
export function validateSentBackReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < SENT_BACK_REASON_MIN_LENGTH) {
    throw new ConvexError({ code: PROFILE_LIFECYCLE_ERRORS.REASON_TOO_SHORT });
  }
  if (trimmed.length > SENT_BACK_REASON_MAX_LENGTH) {
    throw new ConvexError({ code: PROFILE_LIFECYCLE_ERRORS.REASON_TOO_LONG });
  }
  return trimmed;
}

/**
 * The `completed` mentorship line, which a member's own edit never crosses in
 * either direction (AC-16).
 *
 * TO `completed` is rejected because Administration confirms that step
 * (F2-14); AWAY FROM a stored `completed` is rejected for the same reason in
 * reverse — once Administration has confirmed completion, only Administration
 * unconfirms it, or F2-14's gate would be one-way.
 *
 * Re-saving an UNCHANGED `completed` is allowed, which is the case that makes
 * this a comparison rather than a value check: a member whose reviewer already
 * marked them complete still has to be able to save the rest of their form.
 */
export function assertMentorshipChangeAllowed(
  stored: "not_enrolled" | "enrolled" | "completed",
  incoming: "not_enrolled" | "enrolled" | "completed" | undefined
): void {
  if (incoming === undefined || incoming === stored) return;
  if (incoming === "completed") {
    throw new ConvexError({
      code: PROFILE_LIFECYCLE_ERRORS.MENTORSHIP_NEEDS_REVIEW,
    });
  }
  if (stored === "completed") {
    throw new ConvexError({
      code: PROFILE_LIFECYCLE_ERRORS.MENTORSHIP_CONFIRMED,
    });
  }
}

/**
 * Reject a person already holding as many Areas of Service as one person may
 * (AC-19).
 *
 * `liveCount` counts `active` AND `pending_claim` together. Counting only
 * confirmed seats would let somebody queue ten requests and land on ten
 * rosters once each head said yes, with no single mutation ever seeing a
 * violation — confirmations are independent of one another.
 */
export function assertUnderDepartmentCap(liveCount: number): void {
  if (liveCount >= MAX_ACTIVE_DEPARTMENTS) {
    throw new ConvexError({
      code: PROFILE_LIFECYCLE_ERRORS.DEPARTMENT_CAP_REACHED,
    });
  }
}

/**
 * Reject a departure by somebody who leads the department (AC-21).
 *
 * `blockingRoleLabels` is the labels of any active `hod`/`department_admin`
 * rows the caller holds THERE. The refusal carries them, so the person is told
 * which role has to end first rather than being left to retry.
 *
 * A department must not be left headless by its head walking off the roster.
 */
export function assertDepartureAllowed(blockingRoleLabels: string[]): void {
  if (blockingRoleLabels.length > 0) {
    throw new ConvexError({
      code: PROFILE_LIFECYCLE_ERRORS.ROLE_BLOCKS_DEPARTURE,
      roleLabel: blockingRoleLabels.join(" and "),
    });
  }
}

/**
 * Whether a queue row is a resubmission (AC-5).
 *
 * DERIVED, never stored: `pending_verification` with `sentBackAt` set means
 * the row has been round the review loop at least once. There is no
 * `resubmitted` field and no round counter, so nothing can disagree with the
 * row.
 */
export function isResubmission(
  profile: Pick<Doc<"memberProfiles">, "profileStatus" | "sentBackAt">
): boolean {
  return (
    profile.profileStatus === "pending_verification" &&
    profile.sentBackAt !== undefined
  );
}

/**
 * When a row entered the state it is in now, for the reviewer lists' sort.
 *
 * `sentBackAt` where set, else `_creationTime`. Both lists sort on this
 * ascending, so the longest wait is at the top — the oldest-first convention
 * spec 0012 chose for pending claims, and the useful order for both: the queue
 * surfaces who has waited longest, the sent-back list surfaces what has gone
 * stale with its owner.
 */
export function enteredStateAt(
  profile: Pick<Doc<"memberProfiles">, "sentBackAt" | "_creationTime">
): number {
  return profile.sentBackAt ?? profile._creationTime;
}
