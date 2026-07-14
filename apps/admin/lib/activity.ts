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
  profilePictureUrl?: string | null;
  role: "visitor" | "member";
  status: "active" | "suspended";
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
    default:
      return `${actor} — ${entry.action}`;
  }
}

/**
 * The user a feed row should link to: the person the event was about,
 * falling back to the actor.
 */
export function activitySubjectId(entry: ActivityEntry): string | null {
  return entry.targetUser?._id ?? entry.actor?._id ?? null;
}
