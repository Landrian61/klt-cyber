/**
 * Group content windows and caps (spec 0010).
 *
 * These live here rather than inside the Convex queries that read them because
 * three readers have to agree on the same numbers: the query that bounds the
 * read, the screen that explains the bound to the member ("the last 90 days"),
 * and the seed that deliberately plants a row just outside it so the bound is
 * provable. A window defined privately in one query cannot be tested from the
 * other two.
 */

/**
 * How far ahead the one upcoming list looks, in days.
 *
 * 8 weeks: far enough that a member planning a trip sees the convention they
 * need to plan around, near enough that the list stays a list rather than a
 * calendar. Moved out of convex/weeklyPrograms.ts, where it was private, so the
 * merged events-and-activities query and the weekly programs strip on the same
 * screen cannot disagree about where "upcoming" stops.
 */
export const UPCOMING_HORIZON_DAYS = 8 * 7;

/**
 * How far back My groups reads, in days.
 *
 * 90 days is about a quarter, which is the natural life of a department notice:
 * long enough that a member who cleared a notification in July still finds it
 * in September, short enough that the per-group read stays small. A member
 * looking for something older has no way to reach it, which is a known and
 * accepted limit of this feature.
 */
export const GROUP_MESSAGE_WINDOW_DAYS = 90;

/**
 * The most messages read from any one group inside that window.
 *
 * The window alone does not bound the read: a department that posts daily would
 * grow it without limit. This caps each group at 50 newest-first, so the work
 * stays flat however chatty one group becomes. A group that genuinely sends
 * more than 50 in three months silently loses the oldest of them from the view.
 */
export const GROUP_MESSAGE_PAGE_SIZE = 50;

/** The longest a group activity title may be, after trimming. */
export const ACTIVITY_TITLE_MAX_LENGTH = 120;

/** The longest a group activity description may be, after trimming. */
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 2000;

/** The longest a group activity location may be, after trimming. */
export const ACTIVITY_LOCATION_MAX_LENGTH = 160;

/** The longest a group message body may be, after trimming. */
export const GROUP_MESSAGE_MAX_LENGTH = 2000;

/**
 * The longest a cancellation reason may be on an event or a group activity.
 *
 * Deliberately the same 200 as PROGRAM_CANCELLATION_REASON_MAX_LENGTH, for the
 * same reason: a reason has to read inside a crimson chip on a list row without
 * becoming its own paragraph. Kept as its own export rather than reusing that
 * one because the two are different fields on different tables, and one of them
 * changing should not silently move the other.
 */
export const CANCELLATION_REASON_MAX_LENGTH = 200;
