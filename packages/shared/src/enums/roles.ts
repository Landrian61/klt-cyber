// Administrative role types granted via `roleAssignments`. `hod` and
// `department_admin` are scoped to a `departmentId` (docs/Alignment.md,
// Increment 5, which also removed the free-floating `church_admin`).
export const ROLE_TYPES = ['system_admin', 'clan_elder', 'hod', 'department_admin'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];
