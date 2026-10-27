import { DEPARTMENT_FEED_ACTIONS } from "@klt-cyber/shared";

/**
 * One audit entry, as a sentence (spec 0012, AC-35).
 *
 * The action names come from `@klt-cyber/shared` so the Convex mutations that
 * write them, the query that filters on them and this file cannot drift. Only
 * the wording lives here, because wording is presentation and the other two
 * ends have no use for it.
 *
 * Deliberately phrased as "X did Y", with the actor first: a feed is read to
 * answer "what has been going on", and the person who acted is the part a
 * department head is scanning for.
 */

type FeedEntry = {
  action: string;
  actorName: string;
  metadata: Record<string, unknown> | null;
};

const TEMPLATES: Record<(typeof DEPARTMENT_FEED_ACTIONS)[number], string> = {
  "department.claim_created": "asked to serve here",
  "department.claim_confirmed": "confirmed someone's request to serve here",
  "department.claim_declined": "declined a request to serve here",
  "department.member_added": "added someone to the roster",
  "department.member_removed": "removed someone from the roster",
  "department.member_title_updated": "changed someone's position",
  "department.delegate_appointed": "appointed a delegate",
  "department.delegate_removed": "stood a delegate down",
  "department.message_sent": "messaged the department",
  "department.activity_created": "scheduled an activity",
  "department.activity_cancelled": "cancelled an activity",
  "department.description_updated": "edited the department description",
};

export function feedSentence(entry: FeedEntry): string {
  const template = TEMPLATES[entry.action as keyof typeof TEMPLATES];
  if (!template) {
    // The query filters to the known set, so this is unreachable in practice.
    // Rendering the raw action rather than nothing means a newly added action
    // shows up as something to fix rather than as a silently blank row.
    return `${entry.actorName} · ${entry.action}`;
  }

  const title = typeof entry.metadata?.title === "string" ? entry.metadata.title : null;
  if (title && entry.action.startsWith("department.activity")) {
    return `${entry.actorName} ${template}: ${title}`;
  }
  return `${entry.actorName} ${template}`;
}
