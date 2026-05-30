import { z } from 'zod';
import { SEX, MARITAL_STATUSES, AGE_BRACKETS, APPROVAL_STATUSES } from '../enums/user';

// Profile-completion & profile-edit validators. Single source of truth imported
// by the mobile profile flow and by the Convex mutations. See docs/DATA_MODEL.md,
// Increment 2 — "memberProfiles", "children", and "the approval-state pattern".

// Convex ids are opaque strings on the wire; the Convex layer re-validates them
// as `v.id(...)`. Here we only assert non-empty strings.
const convexId = z.string().min(1);

// ISO calendar date, e.g. "1998-04-23". Stored as a string per the data model.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date in YYYY-MM-DD format');

/**
 * The reusable approval-state shape, attached to any record needing authority
 * verification. In this increment it backs `memberProfiles.clanApproval`.
 */
export const approvalStateShape = z.object({
  status: z.enum(APPROVAL_STATUSES),
  verifiedBy: convexId.optional(),
  verifiedAt: z.number().optional(),
  note: z.string().trim().min(1).optional(),
});
export type ApprovalState = z.infer<typeof approvalStateShape>;

/** A single child record owned by a parent member. */
export const childInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dateOfBirth: isoDate.optional(),
  ageBracket: z.enum(AGE_BRACKETS),
  guardianContact: z.string().trim().min(1).max(100).optional(),
});
export type ChildInput = z.infer<typeof childInputSchema>;

/**
 * Visitor → member promotion input. `sex` and `maritalStatus` are required; the
 * rest are optional. `firstName` / `lastName` populate `users` when a Google
 * sign-up did not already supply them.
 */
export const profileCompletionInputSchema = z.object({
  sex: z.enum(SEX),
  maritalStatus: z.enum(MARITAL_STATUSES),
  dateOfBirth: isoDate.optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  clanId: convexId.optional(),
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  children: z.array(childInputSchema).optional(),
});
export type ProfileCompletionInput = z.infer<typeof profileCompletionInputSchema>;

/**
 * Member-editable fields. `sex` is intentionally absent — it is admin-only and
 * the Convex mutation defensively rejects it if ever supplied.
 */
export const profileUpdateInputSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  profilePictureUrl: z.string().url().optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  profession: z.string().trim().min(1).max(100).optional(),
  dateOfBirth: isoDate.optional(),
  clanId: convexId.optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;
