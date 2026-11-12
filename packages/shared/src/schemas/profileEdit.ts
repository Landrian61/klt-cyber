import type { MaritalStatus, Sex } from '../enums/user';
import { normalizeMemberPhone } from '../constants/directory';

/**
 * The member's own edit screen (spec 0023, AC-8, AC-16): the form's draft, the
 * stored values it is built from, and the pure diff that decides what Save
 * sends to `updateMyProfile`.
 *
 * Shared rather than in `apps/mobile/lib/` because the mobile app has no test
 * runner and AC-27 asks for unit tests on the diff; the portal can reuse it.
 */

export type EditMentorshipStatus = 'not_enrolled' | 'enrolled' | 'completed';

export interface EditDateOfBirth {
  day: number;
  month: number;
  year?: number;
}

/** The profile fields the edit screen can change, as stored. */
export interface EditableProfile {
  firstName: string;
  middleName?: string;
  lastName: string;
  sex: Sex;
  maritalStatus: MaritalStatus;
  dateOfBirth?: EditDateOfBirth;
  shortBio?: string;
  phone?: string;
  photoUrl?: string;
  address?: { line1: string; city?: string; district?: string; country?: string };
  spouseUserId?: string;
  spouseNameUnlinked?: string;
  anniversaryDate?: number;
  nextOfKin?: { fullName: string; relationship: string; phone: string };
  mentorshipStatus: EditMentorshipStatus;
  mentorshipProofUrl?: string;
  occupation?: string;
  industry?: string;
  employer?: string;
  skills?: string[];
}

/** The form as typed: strings throughout, so a cleared input is `''`. */
export interface ProfileEditDraft {
  firstName: string;
  middleName: string;
  lastName: string;
  sex: Sex;
  maritalStatus: MaritalStatus;
  dateOfBirth?: EditDateOfBirth;
  shortBio: string;
  phone: string;
  photoUrl?: string;
  address: { line1: string; city: string; district: string; country: string };
  spouseUserId?: string;
  spouseNameUnlinked: string;
  anniversaryDate?: number;
  nextOfKin: { fullName: string; relationship: string; phone: string };
  mentorshipStatus: EditMentorshipStatus;
  mentorshipProofUrl?: string;
  occupation: string;
  industry: string;
  employer: string;
  skills: string[];
}

/**
 * The fields `updateMyProfile` lets a member unset, mirroring its
 * `clearFields` validator. `firstName`, `lastName`, `sex`, `maritalStatus` and
 * `mentorshipStatus` are required on the row and never cleared.
 */
export const PROFILE_CLEARABLE_FIELDS = [
  'middleName',
  'phone',
  'dateOfBirth',
  'shortBio',
  'photoUrl',
  'address',
  'spouseUserId',
  'spouseNameUnlinked',
  'anniversaryDate',
  'nextOfKin',
  'mentorshipProofUrl',
  'occupation',
  'industry',
  'employer',
  'skills',
] as const;
export type ProfileClearableField = (typeof PROFILE_CLEARABLE_FIELDS)[number];

const EDITABLE_KEYS = [
  'firstName',
  'middleName',
  'lastName',
  'sex',
  'maritalStatus',
  'dateOfBirth',
  'shortBio',
  'phone',
  'photoUrl',
  'address',
  'spouseUserId',
  'spouseNameUnlinked',
  'anniversaryDate',
  'nextOfKin',
  'mentorshipStatus',
  'mentorshipProofUrl',
  'occupation',
  'industry',
  'employer',
  'skills',
] as const satisfies readonly (keyof EditableProfile)[];

/** Seed the form from what is stored. */
export function profileEditDraftFrom(profile: EditableProfile): ProfileEditDraft {
  return {
    firstName: profile.firstName,
    middleName: profile.middleName ?? '',
    lastName: profile.lastName,
    sex: profile.sex,
    maritalStatus: profile.maritalStatus,
    dateOfBirth: profile.dateOfBirth,
    shortBio: profile.shortBio ?? '',
    phone: profile.phone ?? '',
    photoUrl: profile.photoUrl,
    address: {
      line1: profile.address?.line1 ?? '',
      city: profile.address?.city ?? '',
      district: profile.address?.district ?? '',
      country: profile.address?.country ?? '',
    },
    spouseUserId: profile.spouseUserId,
    spouseNameUnlinked: profile.spouseNameUnlinked ?? '',
    anniversaryDate: profile.anniversaryDate,
    nextOfKin: {
      fullName: profile.nextOfKin?.fullName ?? '',
      relationship: profile.nextOfKin?.relationship ?? '',
      phone: profile.nextOfKin?.phone ?? '',
    },
    mentorshipStatus: profile.mentorshipStatus,
    mentorshipProofUrl: profile.mentorshipProofUrl,
    occupation: profile.occupation ?? '',
    industry: profile.industry ?? '',
    employer: profile.employer ?? '',
    skills: profile.skills ?? [],
  };
}

function text(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Turn the typed form back into stored shape: trimmed, an empty input becomes
 * absent, an address or next of kin with nothing in it becomes absent, and a
 * phone is normalized to E.164 when it can be. Run on the snapshot draft and
 * the current draft alike, so an untouched value never reads as changed.
 */
export function normalizeProfileEditDraft(draft: ProfileEditDraft): EditableProfile {
  const line1 = text(draft.address.line1);
  const kinName = text(draft.nextOfKin.fullName);
  const kinRelationship = text(draft.nextOfKin.relationship);
  const kinPhone = text(draft.nextOfKin.phone);
  const phone = text(draft.phone);
  const skills = draft.skills.map((skill) => skill.trim()).filter((skill) => skill !== '');

  return {
    firstName: draft.firstName.trim(),
    middleName: text(draft.middleName),
    lastName: draft.lastName.trim(),
    sex: draft.sex,
    maritalStatus: draft.maritalStatus,
    dateOfBirth: draft.dateOfBirth,
    shortBio: text(draft.shortBio),
    phone: phone === undefined ? undefined : (normalizeMemberPhone(phone) ?? phone),
    photoUrl: draft.photoUrl,
    address: line1
      ? {
          line1,
          ...(text(draft.address.city) ? { city: text(draft.address.city) } : {}),
          ...(text(draft.address.district) ? { district: text(draft.address.district) } : {}),
          ...(text(draft.address.country) ? { country: text(draft.address.country) } : {}),
        }
      : undefined,
    spouseUserId: draft.spouseUserId,
    spouseNameUnlinked: text(draft.spouseNameUnlinked),
    anniversaryDate: draft.anniversaryDate,
    nextOfKin:
      kinName && kinRelationship && kinPhone
        ? { fullName: kinName, relationship: kinRelationship, phone: kinPhone }
        : undefined,
    mentorshipStatus: draft.mentorshipStatus,
    mentorshipProofUrl: draft.mentorshipProofUrl,
    occupation: text(draft.occupation),
    industry: text(draft.industry),
    employer: text(draft.employer),
    skills: skills.length > 0 ? skills : undefined,
  };
}

/** Deep equality for the plain JSON values a profile holds. */
export function editValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => editValuesEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      if (!editValuesEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }
  return false;
}

export type ProfileEditChanges = Partial<EditableProfile>;

export interface ProfileEditDiff {
  /** Fields whose value changed, each sent whole (objects included). */
  changes: ProfileEditChanges;
  /** Fields emptied entirely, for `updateMyProfile`'s `clearFields`. */
  clearFields: ProfileClearableField[];
  /** True when nothing would be sent. */
  isEmpty: boolean;
}

/**
 * What Save sends (AC-8): only the fields that differ from the snapshot taken
 * when the screen opened, compared deeply. An emptied clearable field goes in
 * `clearFields`; a required field is never cleared (validation stops that
 * before Save). An untouched `photoUrl` or `mentorshipStatus` is never sent.
 */
export function diffProfileEdit(
  snapshot: EditableProfile,
  next: EditableProfile
): ProfileEditDiff {
  const changes: Record<string, unknown> = {};
  const clearFields: ProfileClearableField[] = [];
  const clearable = new Set<string>(PROFILE_CLEARABLE_FIELDS);

  for (const key of EDITABLE_KEYS) {
    const before = snapshot[key];
    const after = next[key];
    if (editValuesEqual(before, after)) continue;
    if (after === undefined) {
      if (clearable.has(key)) clearFields.push(key as ProfileClearableField);
      continue;
    }
    changes[key] = after;
  }

  return {
    changes: changes as ProfileEditChanges,
    clearFields,
    isEmpty: Object.keys(changes).length === 0 && clearFields.length === 0,
  };
}

/** The top level edit fields that differ between two drafts (for the leave guard). */
export function changedProfileEditFields(
  snapshot: ProfileEditDraft,
  current: ProfileEditDraft
): string[] {
  const diff = diffProfileEdit(
    normalizeProfileEditDraft(snapshot),
    normalizeProfileEditDraft(current)
  );
  return [...Object.keys(diff.changes), ...diff.clearFields];
}
