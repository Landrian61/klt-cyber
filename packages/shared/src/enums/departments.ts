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
