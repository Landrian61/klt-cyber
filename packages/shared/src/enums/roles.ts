// Administrative role types granted via `roleAssignments`. The union extends as
// later modules land (team_leader, hod, tutor, ...). See docs/DATA_MODEL.md,
// Increment 2 — "roleAssignments".
export const ROLE_TYPES = ['system_admin', 'clan_elder'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];
