/**
 * The profile lifecycle: the three states, the send-back round trip, and every
 * string a person reads along the way (spec 0014).
 *
 * Why all of this lives here rather than beside the code that uses it:
 *
 * - The **reason caps** have two enforcers that must agree — the Convex
 *   mutation that rejects an out-of-bounds reason, and the portal textarea
 *   whose counter is supposed to stop the reviewer before they hit it. A cap
 *   defined privately in the mutation leaves the form guessing.
 * - The **error codes** are thrown by Convex and matched by two clients. A
 *   string typed by hand in any one of the three is a refusal the UI shows as
 *   "something went wrong".
 * - The **reviewer name** is a product rule, not a label: A2-05 says a member
 *   reads "the Administration team" and never an individual or another body.
 *   It was four different phrases across four screens before this.
 * - The **notice copy** is shared so the body of a notice is not composed
 *   inside a mutation, where nobody looking for the wording would find it.
 */

// ── The reviewer, as members read them ───────────────────────────────────────

/**
 * What a member is told reviews their profile (A2-05).
 *
 * Never the reviewing account's own name, and never "the elders" or "the
 * church office", both of which named the wrong body and appeared on
 * different screens for the same step. Administration reviews profiles; the
 * individual who happened to open it is not the member's business.
 */
export const REVIEWER_NAME = 'the Administration team';

// ── The send-back reason ─────────────────────────────────────────────────────

/**
 * The shortest a send-back reason may be, after trimming.
 *
 * 10 characters, so a single word ("photo", "wrong") cannot be a reason. The
 * person on the other end has to act on this text alone, and a one-word note
 * tells them a field is wrong without telling them what to do about it.
 */
export const SENT_BACK_REASON_MIN_LENGTH = 10;

/**
 * The longest a send-back reason may be, after trimming.
 *
 * 500 characters: the whole text has to fit one paragraph of an email and one
 * card on a phone. It is a request for a change, not a letter.
 */
export const SENT_BACK_REASON_MAX_LENGTH = 500;

/**
 * How much of the reason a push notification body carries.
 *
 * A push body is clipped by the operating system at a length we do not
 * control, so it is truncated here on purpose, with the full text in the app
 * and in the email. Truncating ourselves means the person sees a sentence that
 * ends in an ellipsis rather than one that stops mid-word.
 */
export const SENT_BACK_REASON_PUSH_LENGTH = 120;

/** The reason trimmed to `SENT_BACK_REASON_PUSH_LENGTH`, ellipsised if it was cut. */
export function sentBackReasonForPush(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length <= SENT_BACK_REASON_PUSH_LENGTH) return trimmed;
  return `${trimmed.slice(0, SENT_BACK_REASON_PUSH_LENGTH - 1).trimEnd()}…`;
}

// ── Error codes ──────────────────────────────────────────────────────────────

/**
 * Every rejection the profile lifecycle functions throw, by code.
 *
 * Thrown as `ConvexError({ code })`, following the `ACCOUNT_DELETION_ERRORS`
 * pattern spec 0008 established: on a production deployment Convex replaces
 * the MESSAGE of an ordinary `Error` with a generic server error, so a client
 * matching on the message works in development and shows the fallback line for
 * every refusal in production. The code survives.
 */
export const PROFILE_LIFECYCLE_ERRORS = {
  /** The row was edited after the screen the caller is acting from was rendered. */
  PROFILE_STALE: 'PROFILE_STALE',
  /** A verified profile cannot be sent back; `verified` is terminal. */
  PROFILE_ALREADY_VERIFIED: 'PROFILE_ALREADY_VERIFIED',
  REASON_TOO_SHORT: 'REASON_TOO_SHORT',
  REASON_TOO_LONG: 'REASON_TOO_LONG',
  /** A member may not move their own mentorship to `completed`. */
  MENTORSHIP_NEEDS_REVIEW: 'MENTORSHIP_NEEDS_REVIEW',
  /** Nor away from a `completed` Administration already confirmed. */
  MENTORSHIP_CONFIRMED: 'MENTORSHIP_CONFIRMED',
  /** They hold HOD or delegate in the department they are trying to leave. */
  ROLE_BLOCKS_DEPARTURE: 'ROLE_BLOCKS_DEPARTURE',
  DEPARTMENT_CAP_REACHED: 'DEPARTMENT_CAP_REACHED',
  DEPARTMENT_ALREADY_LIVE: 'DEPARTMENT_ALREADY_LIVE',
  /** The action needs a verified profile and this caller has not got one. */
  PROFILE_NOT_VERIFIED: 'PROFILE_NOT_VERIFIED',
  /** The row named belongs to somebody else. */
  NOT_YOUR_ROW: 'NOT_YOUR_ROW',
} as const;

export type ProfileLifecycleError =
  (typeof PROFILE_LIFECYCLE_ERRORS)[keyof typeof PROFILE_LIFECYCLE_ERRORS];

/**
 * What each code says to the person who hit it.
 *
 * Keyed by code so a new code cannot ship without copy, and so the mobile
 * screen and the portal page show the same sentence for the same failure.
 *
 * `PROFILE_STALE` is the exception and is deliberately absent: it has two
 * causes needing opposite advice (the owner edited, or another reviewer acted
 * first) and the portal picks between `PROFILE_STALE_OWNER_EDITED` and
 * `PROFILE_STALE_OTHER_REVIEWER` below. A single message for it would tell one
 * of the two readers something false.
 */
export const PROFILE_LIFECYCLE_ERROR_MESSAGES: Record<
  Exclude<ProfileLifecycleError, 'PROFILE_STALE'>,
  string
> = {
  PROFILE_ALREADY_VERIFIED:
    'This profile is already verified, so it cannot be sent back.',
  REASON_TOO_SHORT: `Say a little more — at least ${SENT_BACK_REASON_MIN_LENGTH} characters, so the person knows what to change.`,
  REASON_TOO_LONG: `That is too long. Keep it under ${SENT_BACK_REASON_MAX_LENGTH} characters.`,
  MENTORSHIP_NEEDS_REVIEW: `${REVIEWER_NAME} confirms when mentorship is complete, so this one is not yours to set. Everything else you changed can still be saved.`,
  MENTORSHIP_CONFIRMED: `${REVIEWER_NAME} has confirmed your mentorship as complete, so only they can change it now. Talk to them if this is wrong.`,
  ROLE_BLOCKS_DEPARTURE:
    'You lead this area of service, so that role has to end before you can leave the roster.',
  DEPARTMENT_CAP_REACHED:
    'You are already in as many areas of service as one person can hold. Leave one first.',
  DEPARTMENT_ALREADY_LIVE: 'You have already asked to serve here.',
  PROFILE_NOT_VERIFIED:
    'This is open once your profile has been verified.',
  NOT_YOUR_ROW: 'That is not yours to change.',
};

/**
 * Which of the two stale causes happened, so a reviewer is told the truth.
 *
 * A stored `sentBackAt` newer than the `updatedAt` the reviewer was HOLDING
 * means a colleague acted first; anything else means the owner edited.
 *
 * Two traps, both of which this helper existing in one place is meant to stop,
 * because both portal screens derived it themselves and both got it wrong:
 *
 *   `seenUpdatedAt` must be the value the screen was holding when the reviewer
 *   STARTED, frozen at that moment. Read from a live subscription it has
 *   already moved to the new value, so the comparison can never be true and
 *   every conflict reads as "the owner edited".
 *
 *   `sendProfileBack` writes `sentBackAt` and `updatedAt` to the same instant,
 *   so comparing `sentBackAt` against a FRESH `updatedAt` is comparing a
 *   number with itself.
 */
export function profileStaleCause(
  sentBackAt: number | undefined,
  seenUpdatedAt: number,
): 'owner_edited' | 'other_reviewer' {
  return sentBackAt !== undefined && sentBackAt > seenUpdatedAt
    ? 'other_reviewer'
    : 'owner_edited';
}

/** The two things a stale row can mean to a reviewer, and what to do about each. */
export const PROFILE_STALE_OWNER_EDITED =
  'This person edited their profile while you had it open, so nothing was changed. The screen is showing their latest version now — have another look.';

export const PROFILE_STALE_OTHER_REVIEWER =
  'Another reviewer acted on this profile first, so nothing was changed. The screen is showing where it stands now.';

/** True when `code` is one of this feature's codes, so unknown errors are not mislabelled. */
export function isProfileLifecycleError(
  code: unknown,
): code is ProfileLifecycleError {
  return (
    typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(PROFILE_LIFECYCLE_ERRORS, code)
  );
}

/** The `code` out of whatever a profile lifecycle call threw, or null. */
export function profileLifecycleErrorCode(
  error: unknown,
): ProfileLifecycleError | null {
  const data = (error as { data?: unknown } | null)?.data;
  const code =
    typeof data === 'string'
      ? data
      : (data as { code?: unknown } | null | undefined)?.code;
  if (isProfileLifecycleError(code)) return code;

  // Fallback for anything still throwing a plain `Error` carrying a code.
  const raw = error instanceof Error ? error.message : String(error ?? '');
  for (const known of Object.keys(
    PROFILE_LIFECYCLE_ERRORS,
  ) as ProfileLifecycleError[]) {
    if (raw.includes(known)) return known;
  }
  return null;
}

/**
 * Something worth showing for whatever a profile lifecycle call threw.
 *
 * `staleHint` picks between the two `PROFILE_STALE` sentences. Pass
 * `'other_reviewer'` when the stored `sentBackAt` is newer than the
 * `updatedAt` the reviewer held; `'owner_edited'` otherwise. Callers with no
 * way to tell (mobile, which never holds a reviewer's screen) get the owner
 * sentence, which is the only cause that can reach them.
 */
export function profileLifecycleErrorMessage(
  error: unknown,
  staleHint: 'owner_edited' | 'other_reviewer' = 'owner_edited',
): string {
  const code = profileLifecycleErrorCode(error);
  if (code === 'PROFILE_STALE') {
    return staleHint === 'other_reviewer'
      ? PROFILE_STALE_OTHER_REVIEWER
      : PROFILE_STALE_OWNER_EDITED;
  }
  if (code) return PROFILE_LIFECYCLE_ERROR_MESSAGES[code];
  return 'Something went wrong and nothing was saved. Try again in a moment.';
}

// ── Lifecycle copy a member reads ────────────────────────────────────────────

/**
 * The three states, as a member reads them.
 *
 * No membership language before verification (F2-02, AC-27). "You're in the
 * family!" and "Welcome home" used to greet somebody the moment they pressed
 * submit, which promised them something nobody had yet agreed to. The pending
 * copy says where the profile is and who has it; the verified copy keeps its
 * deliberate "verified" wording, because verification and official membership
 * are two different moments.
 */
export const PROFILE_LIFECYCLE_COPY = {
  pending: {
    title: 'Your profile is with Administration',
    body: `Everything you submitted is with ${REVIEWER_NAME}. They will look it over and let you know. You can change anything you need to while you wait.`,
    /** The action on the pending screen that reopens the submission (F2-03). */
    editAction: 'Edit my submission',
  },
  sentBack: {
    title: 'One thing to fix',
    body: `${REVIEWER_NAME} has asked you to change something before they can verify your profile. Here is what they said:`,
    /** Under the reviewer's own words, before the action. */
    footer:
      'Make the change and send it again. Nothing you already entered has been lost.',
    editAction: 'Open my submission',
  },
  verified: {
    title: 'Your profile has been verified',
    body: `${REVIEWER_NAME} has verified your profile.`,
  },
  /**
   * On a member-only surface a visitor reached, per state.
   *
   * Takes the thing being gated so the sentence names it ("the
   * announcements") rather than saying "this space" on every screen.
   */
  gate: {
    pending: (featureLabel: string) =>
      `Your profile is with ${REVIEWER_NAME}. ${featureLabel} opens the moment they verify it.`,
    sentBack: (featureLabel: string) =>
      `${REVIEWER_NAME} has asked you to change something on your profile. Sort that out and ${featureLabel} opens once they verify it.`,
  },
} as const;

/**
 * Where a verified member with no clan reads what happens next (F2-16, AC-24).
 *
 * One string, shown by mobile and the portal both, wherever a clan name would
 * otherwise be. "Not set" was the old answer and read like a field the person
 * had forgotten to fill in, when in fact there is nothing for them to do.
 */
export const CLAN_UNASSIGNED_COPY =
  'Your clan will be assigned by the Hospitality team';

/** The wizard's clan step option for a person who does not know their clan (AC-23). */
export const CLAN_UNKNOWN_OPTION_LABEL = "I don't know my clan";

/**
 * Mentorship status as a member reads it (AC-28).
 *
 * Shared because the mobile profile screen used to render a HARDCODED
 * "Completed" for everybody, while the wizard's review step had a correct map
 * of its own. One map, two readers, so the two cannot disagree again.
 */
export const MENTORSHIP_STATUS_LABEL: Record<string, string> = {
  not_enrolled: 'Not enrolled',
  enrolled: 'Enrolled',
  completed: 'Completed',
};

// ── Notice copy ──────────────────────────────────────────────────────────────

/**
 * The title and body of every notice this feature sends.
 *
 * Functions rather than template strings where a name or a reason goes in, so
 * a caller cannot assemble the body itself and drift from this wording.
 */
export const PROFILE_LIFECYCLE_NOTICES = {
  /** N06 — to the person whose profile was handed back. */
  sentBack: (reason: string) => ({
    title: 'Your profile needs one change',
    body: `${REVIEWER_NAME} has asked you to change something: ${sentBackReasonForPush(reason)}`,
  }),
  /**
   * N04 — to the Administration reviewers when a profile comes back.
   *
   * Deliberately different wording from a first submission's N04, so a
   * reviewer reading a list of notices can tell a new profile from one they
   * have already seen once.
   */
  resubmitted: (personName: string) => ({
    title: 'A profile has been resubmitted',
    body: `${personName} has made the change you asked for and sent their profile back for review.`,
  }),
  /** N26 — to the elder of a clan a member has just joined. */
  clanJoined: (personName: string, clanName: string) => ({
    title: `${personName} has joined ${clanName}`,
    body: `${personName} set ${clanName} as their clan, so they are now part of your clan.`,
  }),
  /** N26 — to the elder of the clan that member has just left. */
  clanLeft: (personName: string, clanName: string) => ({
    title: `${personName} has left ${clanName}`,
    body: `${personName} changed their clan, so they are no longer part of ${clanName}.`,
  }),
  /** N10 — to a department's HOD when a verified member asks to serve there. */
  claimCreated: (personName: string, departmentName: string) => ({
    title: `Someone asked to serve in ${departmentName}`,
    body: `${personName} wants to join the ${departmentName} roster.`,
  }),
  /** N10 — when that person takes the request back before it was decided. */
  claimWithdrawn: (personName: string, departmentName: string) => ({
    title: `A request for ${departmentName} was withdrawn`,
    body: `${personName} has withdrawn their request to serve in ${departmentName}. Nothing is waiting on you.`,
  }),
  /** N10 — when a member leaves a roster they were already on. */
  memberLeft: (personName: string, departmentName: string) => ({
    title: `${personName} has left ${departmentName}`,
    body: `${personName} has taken themselves off the ${departmentName} roster.`,
  }),
} as const;
