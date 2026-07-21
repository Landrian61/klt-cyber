import { z } from 'zod';

// Role-assignment & clan-verification validators used by the admin portal and
// the Convex role mutations. See docs/DATA_MODEL.md, Increment 2 —
// "roleAssignments" and "the approval-state pattern".

const convexId = z.string().min(1);

/**
 * Discriminated on `roleType` so that the clan scope is required exactly when it
 * is meaningful: `clan_elder` carries a `clanId`; `system_admin` does not.
 */
export const roleAssignmentInputSchema = z.discriminatedUnion('roleType', [
  z.object({
    roleType: z.literal('system_admin'),
    userId: convexId,
    note: z.string().trim().min(1).optional(),
  }),
  z.object({
    roleType: z.literal('clan_elder'),
    userId: convexId,
    clanId: convexId,
    note: z.string().trim().min(1).optional(),
  }),
]);
export type RoleAssignmentInput = z.infer<typeof roleAssignmentInputSchema>;
