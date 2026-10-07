// Administrative role types granted via `roleAssignments`. `hod` and
// `department_admin` are scoped to a `departmentId`.
export const ROLE_TYPES = ['system_admin', 'clan_elder', 'hod', 'department_admin'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];
