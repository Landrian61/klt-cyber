import { z } from 'zod';
import { AGE_BRACKETS, SEX } from '../enums/user';
import { normalizeMemberPhone } from '../constants/directory';
import {
  VISITOR_INVITED_BY_MAX,
  VISITOR_NOTES_MAX,
  VISIT_BACKDATE_MAX_DAYS,
  isAllowedVisitDate,
} from '../constants/hospitality';
import { PROFILE_NAME_MAX } from './profile';

/**
 * The add walk in form (spec 0024, AC-4 to AC-6), as the portal validates it
 * before calling `addWalkIn`.
 *
 * `today` is passed in rather than read here, so the same rule runs on the
 * server (with its own `kampalaToday()`) and in the browser, and a test can
 * pin a date. The server re-checks every rule; this only stops the typist
 * early with the same wording.
 *
 * Empty strings read as "not given", which is how a cleared input arrives.
 */
export function addWalkInSchema(today: string) {
  const optionalText = (max: number, message: string) =>
    z
      .string()
      .trim()
      .max(max, message)
      .optional()
      .transform((value) => (value ? value : undefined));

  return z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1, 'Enter the visitor’s first name.')
        .max(PROFILE_NAME_MAX, `A first name can be at most ${PROFILE_NAME_MAX} characters.`),
      lastName: optionalText(
        PROFILE_NAME_MAX,
        `A last name can be at most ${PROFILE_NAME_MAX} characters.`,
      ),
      phone: z
        .string()
        .trim()
        .optional()
        .transform((value) => (value ? value : undefined))
        .refine((value) => value === undefined || normalizeMemberPhone(value) !== null, {
          message:
            'Check the phone number. A Ugandan number like 0772 123456 works, or the full international form.',
        }),
      consent: z.boolean().default(false),
      sex: z.enum(SEX).optional(),
      ageBracket: z.enum(AGE_BRACKETS).optional(),
      invitedByText: optionalText(
        VISITOR_INVITED_BY_MAX,
        `“Invited by” can be at most ${VISITOR_INVITED_BY_MAX} characters.`,
      ),
      notes: optionalText(VISITOR_NOTES_MAX, `Notes can be at most ${VISITOR_NOTES_MAX} characters.`),
      visitDate: z.string().refine((value) => isAllowedVisitDate(value, today), {
        message: `Choose a visit date from today back to ${VISIT_BACKDATE_MAX_DAYS} days ago.`,
      }),
    })
    .refine((value) => value.phone === undefined || value.consent, {
      path: ['consent'],
      message: 'Tick the consent box to keep this phone number, or leave the number out.',
    });
}

export type AddWalkInInput = z.input<ReturnType<typeof addWalkInSchema>>;
export type AddWalkInValues = z.output<ReturnType<typeof addWalkInSchema>>;
