// Consumer-lifecycle and profile enums — single source of truth shared by the
// mobile app, the web admin, and Convex. See docs/DATA_MODEL.md, Increment 2.

// `system_admin` was dropped from the base role in Increment 2 — administrative
// authority now lives in `roleAssignments`, orthogonal to the consumer lifecycle.
export const USER_ROLES = ['visitor', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SEX = ['male', 'female'] as const;
export type Sex = (typeof SEX)[number];

export const MARITAL_STATUSES = ['single', 'married', 'widowed', 'divorced'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const AGE_BRACKETS = ['0-12', '13-19', '20-35', '36+'] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

export const APPROVAL_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
