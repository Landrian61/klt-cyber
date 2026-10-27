/**
 * Caps for the text a department's leaders write (spec 0012).
 *
 * They live here rather than inside the Convex mutations that enforce them
 * because two readers have to agree on the same number: the mutation that
 * rejects an over-long value, and the form that shows a character counter and
 * stops the typist before they hit it. A cap defined privately in the mutation
 * leaves the form guessing.
 */

/**
 * The longest a department description may be, after trimming.
 *
 * 280 characters: the hub card renders one or two lines under the department
 * name, so this is about as much as fits before the card has to grow. Newlines
 * are collapsed to spaces on the way in for the same reason.
 */
export const DEPARTMENT_DESCRIPTION_MAX_LENGTH = 280;

/**
 * The longest reason an HOD may give when declining a claim, after trimming.
 *
 * Deliberately the same 280 as the description above, though kept as its own
 * export: these are different fields on different tables, and one of them
 * changing should not silently move the other. A reason is a sentence to the
 * person who asked to serve ("we are full this term"), not a letter.
 */
export const CLAIM_DECLINE_REASON_MAX_LENGTH = 280;

/**
 * The longest an HOD-to-HOD notice body may be, after trimming.
 *
 * 1000 characters, well above the 280 of a decline reason, because a notice is
 * the one surface with no reply path (F4-20): the sender has to say the whole
 * thing in one message, so it gets room for a short paragraph rather than a
 * line.
 */
export const HOD_NOTICE_MAX_LENGTH = 1000;

/**
 * The `activityLogs.action` values a department's dashboard feed shows
 * (spec 0012, AC-35).
 *
 * A fixed set rather than "every entry carrying this department", because the
 * audit trail also records things a department's leaders have no business
 * reading on their dashboard. Shared because both ends depend on it: the Convex
 * mutations write these exact strings, the feed read filters on them, and the
 * portal turns each one into a sentence. A typo in any one of the three would
 * otherwise show up as an entry that silently never appears.
 */
export const DEPARTMENT_FEED_ACTIONS = [
  "department.claim_created",
  "department.claim_confirmed",
  "department.claim_declined",
  "department.member_added",
  "department.member_removed",
  "department.member_title_updated",
  "department.delegate_appointed",
  "department.delegate_removed",
  "department.message_sent",
  "department.activity_created",
  "department.activity_cancelled",
  "department.description_updated",
] as const;

export type DepartmentFeedAction = (typeof DEPARTMENT_FEED_ACTIONS)[number];
