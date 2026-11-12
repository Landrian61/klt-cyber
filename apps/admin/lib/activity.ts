import { displayName, roleLabel } from "./format";

// Rendering support for hydrated activity-log entries (the return shape of
// api.admin.listRecentActivity / getUserDetail.recentActivity). Typed
// structurally so the three consumers (dashboard feed, activity page, user
// detail) share one vocabulary.

export interface ActivityUser {
  _id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** One already-resolved photo from the server (spec 0014, AC-14): the
   * profile's own upload where there is one, else the account picture. The
   * raw `users.profilePictureUrl` is no longer sent to any client. */
  photoUrl?: string | null;
  role: "visitor" | "member";
}

export interface ActivityEntry {
  _id: string;
  _creationTime: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  actor: ActivityUser | null;
  targetUser: ActivityUser | null;
  clanName: string | null;
  roleType: string | null;
}

/** Action groups backing the activity page's FilterBar. */
export const ACTIVITY_FILTERS: { key: string; label: string; actions: string[] }[] = [
  { key: "all", label: "All", actions: [] },
  { key: "signups", label: "Sign-ups", actions: ["user.signup"] },
  {
    key: "profiles",
    label: "Profile completions",
    actions: ["profile.completed"],
  },
  {
    key: "roles",
    label: "Role changes",
    actions: ["role.assigned", "role.revoked"],
  },
  {
    key: "suspensions",
    label: "Suspensions",
    actions: ["user.suspended", "user.unsuspended"],
  },
  {
    key: "clans",
    label: "Clan affiliation",
    actions: [
      "clan.affiliation_claimed",
      "clan.affiliation_verified",
      "clan.affiliation_rejected",
    ],
  },
];

/**
 * One human-readable sentence per audit event, e.g.
 * "Ada assigned Elder of Clan Reuben to Bola".
 */
export function describeActivity(entry: ActivityEntry): string {
  const actor = displayName(entry.actor);
  const target = displayName(entry.targetUser);
  const role = entry.roleType
    ? roleLabel(entry.roleType, entry.clanName)
    : "a role";

  switch (entry.action) {
    case "user.signup":
      return `${actor} signed up`;
    case "profile.completed":
      return `${actor} completed their member profile`;
    case "child.added":
      return `${actor} added a child record`;
    case "child.updated":
      return `${actor} updated a child record`;
    case "child.removed":
      return `${actor} removed a child record`;
    case "clan.affiliation_claimed":
      return entry.clanName
        ? `${actor} claimed affiliation with Clan ${entry.clanName}`
        : `${actor} claimed a clan affiliation`;
    case "clan.affiliation_verified":
      return entry.clanName
        ? `${actor} verified ${target}'s affiliation with Clan ${entry.clanName}`
        : `${actor} verified ${target}'s clan affiliation`;
    case "clan.affiliation_rejected":
      return entry.clanName
        ? `${actor} rejected ${target}'s affiliation with Clan ${entry.clanName}`
        : `${actor} rejected ${target}'s clan affiliation`;
    case "role.assigned":
      return `${actor} assigned ${role} to ${target}`;
    case "role.revoked":
      return `${actor} revoked ${role} from ${target}`;
    case "user.suspended":
      return `${actor} suspended ${target}'s account`;
    case "user.unsuspended":
      return `${actor} reactivated ${target}'s account`;
    default: {
      const church = CHURCH_ACTION_PHRASES[entry.action];
      if (church) return church(actor, target);
      return `${actor} — ${entry.action}`;
    }
  }
}

/**
 * Church activity the Administration dashboard shows (spec 0021, AC-1; the
 * allowlist is `CHURCH_ACTIVITY_ACTIONS` in @klt-cyber/shared). The summary
 * stays a client concern, as it always has been.
 */
const CHURCH_ACTION_PHRASES: Record<string, (actor: string, target: string) => string> = {
  "profile.submitted": (a) => `${a} submitted their member profile`,
  "profile.resubmitted": (a) => `${a} resubmitted their member profile`,
  "profile.verified": (a, t) => `${a} verified ${t}'s profile`,
  "profile.sent_back": (a, t) => `${a} sent ${t}'s profile back for changes`,
  "department.claim_confirmed": (a, t) => `${a} confirmed ${t}'s department claim`,
  "department.claim_declined": (a, t) => `${a} declined ${t}'s department claim`,
  "department.member_added": (a, t) => `${a} added ${t} to a department`,
  "department.delegate_appointed": (a, t) => `${a} appointed ${t} as a delegate`,
  "department.delegate_removed": (a, t) => `${a} removed ${t} as a delegate`,
  "content.event_created": (a) => `${a} created an event`,
  "content.event_updated": (a) => `${a} updated an event`,
  "content.event_cancelled": (a) => `${a} cancelled an event`,
  "content.event_archived": (a) => `${a} archived an event`,
  "content.announcement_created": (a) => `${a} drafted an announcement`,
  "content.announcement_updated": (a) => `${a} updated an announcement`,
  "content.announcement_published": (a) => `${a} published an announcement`,
  "content.program_created": (a) => `${a} added a weekly program`,
  "content.program_updated": (a) => `${a} updated a weekly program`,
  "content.program_activated": (a) => `${a} switched a weekly program on`,
  "content.program_deactivated": (a) => `${a} switched a weekly program off`,
  "content.program_occurrence_cancelled": (a) => `${a} called off a program occurrence`,
  "content.program_occurrence_restored": (a) => `${a} restored a program occurrence`,
  "content.activity_created": (a) => `${a} planned an activity`,
  "content.activity_updated": (a) => `${a} updated a planned activity`,
  "content.activity_deleted": (a) => `${a} deleted a planned activity`,
  "department.activity_created": (a) => `${a} scheduled a department activity`,
  "department.activity_updated": (a) => `${a} updated a department activity`,
  "department.activity_cancelled": (a) => `${a} cancelled a department activity`,
};

/**
 * The user a feed row should link to: the person the event was about,
 * falling back to the actor.
 */
export function activitySubjectId(entry: ActivityEntry): string | null {
  return entry.targetUser?._id ?? entry.actor?._id ?? null;
}
