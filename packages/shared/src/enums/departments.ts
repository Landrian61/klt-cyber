// A member — verified or self-added via the profile-completion wizard — may
// serve on up to this many department rosters (`departmentMemberships`)
// simultaneously. See convex/departmentMemberships.ts (admin/HOD-initiated
// `addDepartmentMember`) and convex/memberProfiles.ts (self-service
// `submitProfile` Areas of Service step) — both enforce this same cap.
export const MAX_ACTIVE_DEPARTMENTS = 3;

export const ROSTER_PORTAL_DEPARTMENTS = [
  "Media",
  "Hospitality",
  "Library & Information",
] as const;

export const PAUSED_DEPARTMENTS = [
  "Education",
  "Worship Ministry",
  "Ushering",
  "Missions & Outreach",
  "Children's Ministry",
  "Eagles Youth",
] as const;

/**
 * Every state a `departmentMemberships` row can hold (spec 0012).
 *
 * `pending_claim` is the one genuinely new concept: asking to serve in a
 * department creates a request an HOD confirms or declines, instead of silently
 * placing the person on the roster. `declined` and `removed` are terminal — a
 * person who claims again gets a fresh row, so the sequence of decisions stays
 * legible.
 *
 * At most one row per user and department is ever `pending_claim` or `active`.
 * Convex has no unique indexes, so every writer either promotes the live row or
 * rejects; see convex/departmentMemberships.ts.
 *
 * Defined here because the Convex schema, both apps' roster views and the
 * mobile "my areas of service" read all branch on the same four values.
 */
export const DEPARTMENT_MEMBERSHIP_STATUSES = [
  "pending_claim",
  "active",
  "removed",
  "declined",
] as const;

export type DepartmentMembershipStatus =
  (typeof DEPARTMENT_MEMBERSHIP_STATUSES)[number];

/** The statuses that occupy a person's seat, so a second row may not be created. */
export const LIVE_DEPARTMENT_MEMBERSHIP_STATUSES = [
  "pending_claim",
  "active",
] as const satisfies readonly DepartmentMembershipStatus[];

/**
 * The fixed icon every department renders, on its hub card and in its portal
 * header (spec 0012, AC-7).
 *
 * A string key and not a component, because this package is imported by Convex
 * (which cannot load React) and by both apps, whose icon sets differ. The admin
 * app maps a key to a lucide component; mobile can map the same key to its own
 * set later.
 *
 * Keyed by name, following `PAUSED_DEPARTMENTS` and `ROSTER_PORTAL_DEPARTMENTS`
 * above: the thirteen names are seeded reference data, not editable, so the name
 * is a stable key.
 */
export const DEPARTMENT_ICON_KEYS = {
  Administration: "shield",
  Pastoral: "heart-handshake",
  Finance: "wallet",
  Education: "graduation-cap",
  Media: "radio",
  "Worship Ministry": "music",
  Ushering: "hand",
  "Missions & Outreach": "globe",
  Hospitality: "coffee",
  "Children's Ministry": "baby",
  "Eagles Youth": "flame",
  "Real Estate": "building",
  "Library & Information": "library",
} as const;

/** What a department added later, with no entry above, renders instead. */
export const DEPARTMENT_ICON_FALLBACK_KEY = "users";

export type DepartmentIconKey =
  | (typeof DEPARTMENT_ICON_KEYS)[keyof typeof DEPARTMENT_ICON_KEYS]
  | typeof DEPARTMENT_ICON_FALLBACK_KEY;

/** The icon key for a department name, falling back rather than returning nothing. */
export function departmentIconKey(name: string): DepartmentIconKey {
  return (
    (DEPARTMENT_ICON_KEYS as Record<string, DepartmentIconKey | undefined>)[
      name
    ] ?? DEPARTMENT_ICON_FALLBACK_KEY
  );
}

/**
 * Turn a department name into its URL slug (spec 0012).
 *
 * One function shared by the portal and Convex, so a link the hub renders and
 * the server side resolution behind `/areas-of-service/<slug>` can never
 * disagree about which department a slug names. It replaces the admin app's
 * former private `lib/slugify.ts`; a unit test asserts it produces exactly the
 * same output as that function did for all thirteen seeded names, because the
 * hub already links using it and a different result would break every link.
 */
export function slugifyDepartmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
