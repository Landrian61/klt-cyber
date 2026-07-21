import { z } from 'zod';
import { SEX, APPROVAL_STATUSES } from '../enums/user';

// Child-record validator. Single source of truth imported by the mobile
// profile-submission wizard and the Convex `children` mutations. See
// docs/DATA_MODEL.md, Increment 4 — "children" (supersedes Increment 2's
// `ageBracket`/`guardianContact` shape).

// Convex ids are opaque strings on the wire; the Convex layer re-validates them
// as `v.id(...)`. Here we only assert non-empty strings.
const convexId = z.string().min(1);

/**
 * The reusable approval-state shape, attached to any record needing authority
 * verification (DATA_MODEL.md, Increment 2). Not currently backing any live
 * field — `memberProfiles` verification uses the simpler `profileStatus`
 * pending_verification/verified pair instead (Increment 4) — kept here for
 * reuse by a future increment that needs the fuller shape.
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
  dateOfBirth: z.number().optional(),
  sex: z.enum(SEX),
});
export type ChildInput = z.infer<typeof childInputSchema>;
