import { z } from 'zod';
import { SEX, APPROVAL_STATUSES } from '../enums/user';
import { normalizeMemberPhone } from '../constants/directory';
import { PROFILE_SHORT_BIO_MAX } from '../constants/settings';

/** Name length on the edit screen, matching sign up (AC-9). */
export const PROFILE_NAME_MAX = 50;

// Child-record validator. Single source of truth imported by the mobile
// profile-submission wizard and the Convex `children` mutations.

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

// ── The member's own edit screen (spec 0023, AC-9) ──────────────────────────

/**
 * Client side checks for the mobile edit screen, run before Save. The server
 * (`updateMyProfile`) does not repeat them, so a non mobile caller could still
 * save a blank first name; that tradeoff is recorded in spec 0023.
 *
 * It validates the form as typed (strings throughout), so a half filled
 * address or next of kin is caught here rather than half sent.
 */
const editName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}`)
    .max(PROFILE_NAME_MAX, `Keep your ${label} under ${PROFILE_NAME_MAX + 1} characters`);

export const profileEditSchema = z
  .object({
    firstName: editName('first name'),
    middleName: z
      .string()
      .trim()
      .max(PROFILE_NAME_MAX, `Keep your middle name under ${PROFILE_NAME_MAX + 1} characters`),
    lastName: editName('last name'),
    // Typed the way people say it ("0772 123456"), then normalized to E.164.
    phone: z
      .string()
      .refine(
        (value) => value.trim() === '' || normalizeMemberPhone(value) !== null,
        'Enter a phone number like 0772 123456 or +256772123456'
      ),
    shortBio: z
      .string()
      .trim()
      .max(PROFILE_SHORT_BIO_MAX, `Keep your bio under ${PROFILE_SHORT_BIO_MAX + 1} characters`),
    dateOfBirth: z
      .object({
        day: z.number().int().min(1, 'Pick a day').max(31, 'Pick a day'),
        month: z.number().int().min(1, 'Pick a month').max(12, 'Pick a month'),
        year: z
          .number()
          .int()
          .refine((year) => year <= new Date().getFullYear(), 'That year is in the future')
          .optional(),
      })
      .optional(),
    address: z.object({
      line1: z.string(),
      city: z.string(),
      district: z.string(),
      country: z.string(),
    }),
    nextOfKin: z.object({
      fullName: z.string(),
      relationship: z.string(),
      phone: z.string(),
    }),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const { line1, city, district, country } = value.address;
    const anyAddress = [line1, city, district, country].some((part) => part.trim() !== '');
    if (anyAddress && line1.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['address', 'line1'],
        message: 'Add the first line of your address, or clear the rest',
      });
    }
    const kin = value.nextOfKin;
    const kinParts = [kin.fullName, kin.relationship, kin.phone];
    if (kinParts.some((part) => part.trim() !== '')) {
      const labels = { fullName: 'their name', relationship: 'how they are related', phone: 'their phone' };
      for (const key of ['fullName', 'relationship', 'phone'] as const) {
        if (kin[key].trim() === '') {
          ctx.addIssue({
            code: 'custom',
            path: ['nextOfKin', key],
            message: `Add ${labels[key]}, or clear next of kin`,
          });
        }
      }
    }
  });
export type ProfileEditInput = z.input<typeof profileEditSchema>;
